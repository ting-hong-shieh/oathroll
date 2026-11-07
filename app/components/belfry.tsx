/** Vector fallback for the art slots: an engraved elevation of Saltmere. */
export function Belfry({ className = "" }: { className?: string }) {
  return <svg className={`belfry ${className}`} viewBox="0 0 600 760" fill="none" aria-hidden="true">
    <defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0" stroke="currentColor" strokeWidth=".45" /></pattern></defs>
    <g stroke="currentColor">
      <circle cx="310" cy="238" r="171" strokeWidth=".55" /><circle cx="310" cy="238" r="180" strokeWidth=".3" strokeDasharray="2 8" />
      <path d="M310 32V51M310 424V445M101 238H122M500 238H518M160 88 174 103M446 377 460 393M160 389 175 374M447 102 461 88" strokeWidth=".5" />
      <path d="M238 607 242 269 224 269 274 190 284 165 302 158 319 165 329 190 378 269 359 269 368 607Z" fill="var(--ink)" strokeWidth="1.4" />
      <path d="M242 274 359 274M246 284 357 284M251 381 361 381M250 391 361 391M245 503 364 503M244 512 364 512" />
      <path d="M302 157V115M290 127H315M274 190H329M260 226H345M239 256H363M255 269 284 190 302 171 319 190 347 269" strokeWidth=".8" />
      <path d="M269 363V316Q270 284 302 284Q334 284 335 316V363Z" fill="url(#hatch)" />
      <path d="M285 317Q285 299 302 299Q319 299 319 317L323 346H281ZM302 346V357M278 347H326M279 303H325" fill="var(--ink)" />
      <path d="M301 420Q320 420 320 440V481H283V440Q283 420 301 420ZM301 533Q318 533 318 552V607H282V552Q282 533 301 533Z" fill="url(#hatch)" />
      <path d="M252 296 249 369M259 403 255 494M260 521 256 587M347 295 351 369M344 403 349 494M345 521 349 591" strokeWidth=".45" />
      <path d="M248 307H268M335 325H357M250 353H265M248 421H277M322 452H360M247 475H276M322 555H363M246 578H276M289 200 296 217 290 232 295 246" strokeWidth=".5" />
      <path d="M244 540 210 625M255 543 221 628M242 551 251 555M237 565 245 569M231 580 239 584M225 594 233 598M219 609 227 613" />
      <path d="M115 621Q180 594 248 612T381 611T510 614M55 638Q130 616 205 635T359 634T548 631M90 658Q165 641 228 656T383 654T520 659M139 682Q210 664 279 680T447 678M185 704Q252 690 309 702T409 700" strokeWidth=".7" />
      <path d="M173 589V566L194 551 213 567V605M182 576H193V591M387 603V553L410 531 434 555V611M398 566H411V583M448 617V580L464 565 481 580V609" strokeWidth=".6" />
      <path d="M95 478 118 468 141 478M442 171 458 164 475 172M460 195 473 189 486 195" strokeWidth=".8" />
      <path d="M211 104H241M226 89V119M397 390H417M407 380V400" strokeWidth=".5" />
    </g>
    <g fill="currentColor" fontFamily="var(--font-mono)" fontSize="8" letterSpacing="3"><text x="213" y="745">SALTMERE · LOW TIDE</text></g>
  </svg>;
}
