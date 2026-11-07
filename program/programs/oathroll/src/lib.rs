//! Oathroll: an AI game master that cannot cheat.
//!
//! Every check goes through a fixed lifecycle:
//!
//!   draft_check  -> Draft     (the Keeper may still revise it with amend_check)
//!   seal_check   -> Sealed    (DC and all four outcomes are frozen on-chain)
//!   request_roll -> Pending   (verifiable randomness is requested from MagicBlock VRF)
//!   callback     -> Resolved  (the program, not the AI, picks the outcome and applies it)
//!
//! Once a check is sealed nothing can change it: amend_check fails with `TableSealed`.
//! The DC must sit inside a fixed band for each action kind, so the Keeper cannot set
//! an impossible difficulty either.

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    anchor::{vrf, vrf_callback},
    vrf::{
        self,
        instructions::{create_request_scoped_randomness_ix, RequestRandomnessParams},
        types::SerializableAccountMeta,
    },
};

declare_id!("HaaUtRdJLNAhEShaA7ibDDHoz5truec23qf5ZSq4eGGd");

pub const SESSION_SEED: &[u8] = b"session";
pub const CHECK_SEED: &[u8] = b"check";

pub const MAX_ACTION_LEN: usize = 96;
pub const MAX_OUTCOME_LEN: usize = 140;
pub const MAX_TITLE_LEN: usize = 48;
pub const MAX_PLEA_LEN: usize = 160;

pub const START_NERVE: i8 = 3;
pub const START_TIDE: u8 = 5;
pub const GOAL_PROGRESS: u8 = 3;

/// Outcome rows, in table order.
pub const DISASTER: u8 = 0; // natural 1
pub const SETBACK: u8 = 1; // roll < DC
pub const SUCCESS: u8 = 2; // roll >= DC
pub const TRIUMPH: u8 = 3; // natural 20

#[program]
pub mod oathroll {
    use super::*;

    /// Start a run. `player` is the browser's public key; `gm` (the Keeper's server key)
    /// pays and is the only key allowed to write checks for this session.
    pub fn create_session(ctx: Context<CreateSession>, nonce: u64, title: String) -> Result<()> {
        require!(title.len() <= MAX_TITLE_LEN, OathError::TextTooLong);
        let s = &mut ctx.accounts.session;
        s.player = ctx.accounts.player.key();
        s.gm = ctx.accounts.gm.key();
        s.nonce = nonce;
        s.title = title;
        s.nerve = START_NERVE;
        s.tide = START_TIDE;
        s.progress = 0;
        s.next_seq = 0;
        s.open_check = false;
        s.created_slot = Clock::get()?.slot;
        s.bump = ctx.bumps.session;
        emit!(SessionCreated { session: s.key(), player: s.player, gm: s.gm });
        Ok(())
    }

    /// The Keeper writes a ruling for the player's declared action. Still editable.
    pub fn draft_check(
        ctx: Context<DraftCheck>,
        action_kind: u8,
        action_text: String,
        dc: u8,
        outcomes: [Outcome; 4],
    ) -> Result<()> {
        let s = &mut ctx.accounts.session;
        require!(!s.open_check, OathError::CheckAlreadyOpen);
        require!(s.nerve > 0 && s.tide > 0 && s.progress < GOAL_PROGRESS, OathError::RunOver);
        validate_ruling(action_kind, &action_text, dc, &outcomes)?;

        let c = &mut ctx.accounts.check;
        c.session = s.key();
        c.seq = s.next_seq;
        c.action_kind = action_kind;
        c.action_text = action_text;
        c.dc = dc;
        c.outcomes = outcomes;
        c.status = CheckStatus::Draft;
        c.draft_slot = Clock::get()?.slot;
        c.bump = ctx.bumps.check;

        s.open_check = true;
        s.next_seq = s.next_seq.checked_add(1).ok_or(OathError::Overflow)?;
        emit!(CheckDrafted { check: c.key(), seq: c.seq, dc });
        Ok(())
    }

    /// Revise a draft's DC. Only possible before the ruling is sealed; afterwards every attempt fails.
    pub fn amend_check(ctx: Context<AmendCheck>, dc: u8, plea: String) -> Result<()> {
        // The player's words travel with the attempt. They are logged first, so a refused
        // amendment keeps them in its (failed) transaction logs.
        require!(plea.len() <= MAX_PLEA_LEN, OathError::TextTooLong);
        if !plea.is_empty() {
            msg!("Plea: {}", plea);
        }
        let c = &mut ctx.accounts.check;
        require!(c.status == CheckStatus::Draft, OathError::TableSealed);
        let kind = c.action_kind;
        let outcomes = c.outcomes.clone();
        validate_ruling(kind, &c.action_text.clone(), dc, &outcomes)?;
        c.dc = dc;
        c.amendments = c.amendments.saturating_add(1);
        emit!(CheckAmended { check: c.key(), dc });
        Ok(())
    }

    /// Freeze the ruling. From here on the DC and the outcome table are immutable.
    pub fn seal_check(ctx: Context<SealCheck>) -> Result<()> {
        let c = &mut ctx.accounts.check;
        require!(c.status == CheckStatus::Draft, OathError::TableSealed);
        c.status = CheckStatus::Sealed;
        c.seal_slot = Clock::get()?.slot;
        emit!(CheckSealed { check: c.key(), seq: c.seq, dc: c.dc, slot: c.seal_slot });
        Ok(())
    }

    /// Ask MagicBlock VRF for randomness. Only a sealed check can be rolled, and only once.
    pub fn request_roll(ctx: Context<RequestRoll>) -> Result<()> {
        let check_key = ctx.accounts.check.key();
        let session_key = ctx.accounts.session.key();
        {
            let c = &mut ctx.accounts.check;
            require!(c.status == CheckStatus::Sealed, OathError::NotSealed);
            c.status = CheckStatus::Pending;
            c.request_slot = Clock::get()?.slot;
        }
        let ix = create_request_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.gm.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::ResolveRoll::DISCRIMINATOR.to_vec(),
            caller_seed: check_key.to_bytes(),
            accounts_metas: Some(vec![
                SerializableAccountMeta { pubkey: check_key, is_signer: false, is_writable: true },
                SerializableAccountMeta { pubkey: session_key, is_signer: false, is_writable: true },
            ]),
            ..Default::default()
        });
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.gm.to_account_info(), &ix)?;
        emit!(RollRequested { check: check_key, slot: ctx.accounts.check.request_slot });
        Ok(())
    }

    /// Called by the VRF program with fresh randomness. The program alone decides the row.
    pub fn resolve_roll(ctx: Context<ResolveRollCtx>, randomness: [u8; 32]) -> Result<()> {
        let c = &mut ctx.accounts.check;
        let s = &mut ctx.accounts.session;
        require!(c.status == CheckStatus::Pending, OathError::NotPending);
        require_keys_eq!(c.session, s.key(), OathError::WrongSession);

        let roll = vrf::rnd::random_u8_with_range(&randomness, 1, 20);
        let row = outcome_row(roll, c.dc);
        let o = c.outcomes[row as usize].clone();

        c.randomness = randomness;
        c.roll = roll;
        c.outcome = row;
        c.status = CheckStatus::Resolved;
        c.resolve_slot = Clock::get()?.slot;

        s.nerve = s.nerve.saturating_add(o.nerve_delta).max(0);
        s.tide = s.tide.saturating_sub(1);
        s.progress = (s.progress as i16 + o.progress_delta as i16).clamp(0, GOAL_PROGRESS as i16) as u8;
        s.open_check = false;

        emit!(RollResolved {
            check: c.key(),
            roll,
            dc: c.dc,
            outcome: row,
            nerve: s.nerve,
            tide: s.tide,
            progress: s.progress,
        });
        Ok(())
    }
}

/// Map a d20 roll to an outcome row. Pure, so the client and verifier use the same rule.
pub fn outcome_row(roll: u8, dc: u8) -> u8 {
    if roll == 1 {
        DISASTER
    } else if roll == 20 {
        TRIUMPH
    } else if roll >= dc {
        SUCCESS
    } else {
        SETBACK
    }
}

/// DC band per action kind: 0 explore, 1 persuade, 2 sneak, 3 force.
pub fn dc_band(action_kind: u8) -> Option<(u8, u8)> {
    match action_kind {
        0 => Some((6, 12)),
        1 => Some((8, 14)),
        2 => Some((8, 14)),
        3 => Some((10, 16)),
        _ => None,
    }
}

pub fn validate_ruling(action_kind: u8, action_text: &str, dc: u8, outcomes: &[Outcome; 4]) -> Result<()> {
    let (lo, hi) = dc_band(action_kind).ok_or(OathError::BadActionKind)?;
    require!(dc >= lo && dc <= hi, OathError::DcOutOfBounds);
    require!(!action_text.is_empty() && action_text.len() <= MAX_ACTION_LEN, OathError::TextTooLong);
    for (i, o) in outcomes.iter().enumerate() {
        require!(!o.text.is_empty() && o.text.len() <= MAX_OUTCOME_LEN, OathError::TextTooLong);
        require!(o.nerve_delta >= -2 && o.nerve_delta <= 1, OathError::EffectOutOfBounds);
        require!(o.progress_delta >= 0 && o.progress_delta <= 2, OathError::EffectOutOfBounds);
        // A failure can never be kinder than a success: rows must be ordered by fortune.
        if i == DISASTER as usize || i == SETBACK as usize {
            require!(o.nerve_delta <= 0 && o.progress_delta == 0, OathError::InconsistentTable);
        } else {
            require!(o.nerve_delta >= 0 && o.progress_delta >= 1, OathError::InconsistentTable);
        }
    }
    require!(outcomes[0].nerve_delta <= outcomes[1].nerve_delta, OathError::InconsistentTable);
    require!(outcomes[3].progress_delta >= outcomes[2].progress_delta, OathError::InconsistentTable);
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct Outcome {
    #[max_len(MAX_OUTCOME_LEN)]
    pub text: String,
    pub nerve_delta: i8,
    pub progress_delta: i8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum CheckStatus {
    Draft,
    Sealed,
    Pending,
    Resolved,
}

#[account]
#[derive(InitSpace)]
pub struct Session {
    pub player: Pubkey,
    pub gm: Pubkey,
    pub nonce: u64,
    #[max_len(MAX_TITLE_LEN)]
    pub title: String,
    pub nerve: i8,
    pub tide: u8,
    pub progress: u8,
    pub next_seq: u16,
    pub open_check: bool,
    pub created_slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Check {
    pub session: Pubkey,
    pub seq: u16,
    pub action_kind: u8,
    #[max_len(MAX_ACTION_LEN)]
    pub action_text: String,
    pub dc: u8,
    pub outcomes: [Outcome; 4],
    pub status: CheckStatus,
    pub amendments: u8,
    pub draft_slot: u64,
    pub seal_slot: u64,
    pub request_slot: u64,
    pub resolve_slot: u64,
    pub randomness: [u8; 32],
    pub roll: u8,
    pub outcome: u8,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub gm: Signer<'info>,
    /// CHECK: the player's public key, used only as an identifier and PDA seed.
    pub player: UncheckedAccount<'info>,
    #[account(
        init,
        payer = gm,
        space = 8 + Session::INIT_SPACE,
        seeds = [SESSION_SEED, player.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub session: Account<'info, Session>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DraftCheck<'info> {
    #[account(mut)]
    pub gm: Signer<'info>,
    #[account(mut, has_one = gm @ OathError::NotKeeper)]
    pub session: Account<'info, Session>,
    #[account(
        init,
        payer = gm,
        space = 8 + Check::INIT_SPACE,
        seeds = [CHECK_SEED, session.key().as_ref(), &session.next_seq.to_le_bytes()],
        bump
    )]
    pub check: Account<'info, Check>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AmendCheck<'info> {
    pub gm: Signer<'info>,
    #[account(has_one = gm @ OathError::NotKeeper)]
    pub session: Account<'info, Session>,
    #[account(mut, has_one = session @ OathError::WrongSession)]
    pub check: Account<'info, Check>,
}

#[derive(Accounts)]
pub struct SealCheck<'info> {
    pub gm: Signer<'info>,
    #[account(has_one = gm @ OathError::NotKeeper)]
    pub session: Account<'info, Session>,
    #[account(mut, has_one = session @ OathError::WrongSession)]
    pub check: Account<'info, Check>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestRoll<'info> {
    #[account(mut)]
    pub gm: Signer<'info>,
    #[account(mut, has_one = gm @ OathError::NotKeeper)]
    pub session: Account<'info, Session>,
    #[account(mut, has_one = session @ OathError::WrongSession)]
    pub check: Account<'info, Check>,
    /// CHECK: the MagicBlock VRF oracle queue
    #[account(
        mut,
        constraint = oracle_queue.key() == vrf::consts::DEFAULT_QUEUE
            || oracle_queue.key() == vrf::consts::DEFAULT_TEST_QUEUE @ OathError::BadQueue
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct ResolveRollCtx<'info> {
    #[account(mut)]
    pub check: Account<'info, Check>,
    #[account(mut)]
    pub session: Account<'info, Session>,
}

#[event]
pub struct SessionCreated {
    pub session: Pubkey,
    pub player: Pubkey,
    pub gm: Pubkey,
}

#[event]
pub struct CheckDrafted {
    pub check: Pubkey,
    pub seq: u16,
    pub dc: u8,
}

#[event]
pub struct CheckAmended {
    pub check: Pubkey,
    pub dc: u8,
}

#[event]
pub struct CheckSealed {
    pub check: Pubkey,
    pub seq: u16,
    pub dc: u8,
    pub slot: u64,
}

#[event]
pub struct RollRequested {
    pub check: Pubkey,
    pub slot: u64,
}

#[event]
pub struct RollResolved {
    pub check: Pubkey,
    pub roll: u8,
    pub dc: u8,
    pub outcome: u8,
    pub nerve: i8,
    pub tide: u8,
    pub progress: u8,
}

#[error_code]
pub enum OathError {
    #[msg("The ruling is sealed. The Keeper is bound and cannot change it.")]
    TableSealed,
    #[msg("DC is outside the allowed band for this kind of action.")]
    DcOutOfBounds,
    #[msg("Unknown action kind.")]
    BadActionKind,
    #[msg("Text is empty or too long.")]
    TextTooLong,
    #[msg("Outcome effect is outside the allowed range.")]
    EffectOutOfBounds,
    #[msg("Outcome table is inconsistent: a failure cannot be kinder than a success.")]
    InconsistentTable,
    #[msg("Another check is still open in this session.")]
    CheckAlreadyOpen,
    #[msg("This run is over.")]
    RunOver,
    #[msg("Only the session's Keeper key may do this.")]
    NotKeeper,
    #[msg("Check does not belong to this session.")]
    WrongSession,
    #[msg("Only a sealed check can be rolled.")]
    NotSealed,
    #[msg("Check is not waiting for randomness.")]
    NotPending,
    #[msg("Unexpected oracle queue.")]
    BadQueue,
    #[msg("Arithmetic overflow.")]
    Overflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn o(t: &str, n: i8, p: i8) -> Outcome {
        Outcome { text: t.to_string(), nerve_delta: n, progress_delta: p }
    }

    fn table() -> [Outcome; 4] {
        [o("You fall.", -2, 0), o("You slip.", -1, 0), o("You climb.", 0, 1), o("You fly up.", 1, 2)]
    }

    #[test]
    fn rows_follow_the_roll() {
        assert_eq!(outcome_row(1, 12), DISASTER);
        assert_eq!(outcome_row(11, 12), SETBACK);
        assert_eq!(outcome_row(12, 12), SUCCESS);
        assert_eq!(outcome_row(19, 12), SUCCESS);
        assert_eq!(outcome_row(20, 12), TRIUMPH);
        // a natural 1 fails even against the easiest DC; a natural 20 wins against the hardest
        assert_eq!(outcome_row(1, 6), DISASTER);
        assert_eq!(outcome_row(20, 16), TRIUMPH);
    }

    #[test]
    fn dc_bands_are_enforced() {
        assert!(validate_ruling(0, "Climb the ladder", 12, &table()).is_ok());
        assert!(validate_ruling(0, "Climb the ladder", 13, &table()).is_err());
        assert!(validate_ruling(3, "Pry the clapper", 9, &table()).is_err());
        assert!(validate_ruling(3, "Pry the clapper", 16, &table()).is_ok());
        assert!(validate_ruling(9, "Dance", 10, &table()).is_err());
    }

    #[test]
    fn tables_must_be_ordered_by_fortune() {
        let mut t = table();
        t[0] = o("You fall upward into treasure.", 1, 2);
        assert!(validate_ruling(0, "Climb", 10, &t).is_err());
        let mut t = table();
        t[2] = o("Success, but you lose nerve and get nowhere.", -1, 0);
        assert!(validate_ruling(0, "Climb", 10, &t).is_err());
    }

    #[test]
    fn text_limits() {
        let long = "x".repeat(MAX_ACTION_LEN + 1);
        assert!(validate_ruling(0, &long, 10, &table()).is_err());
        assert!(validate_ruling(0, "", 10, &table()).is_err());
    }
}
