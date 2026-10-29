/**
 * Animation de chargement : burger, sushi et pizza en orbite (mêmes dessins que le prototype).
 * N'apparaît qu'après 350 ms (classe CSS « food-loader ») : rien ne clignote pour un chargement rapide.
 */

function Burger() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <path d="M8 22a16 12 0 0132 0z" fill="#F4A63A" />
      <path d="M8 22h32" stroke="#E08E22" strokeWidth="2" />
      <g fill="#FFF3D6">
        <ellipse cx="17" cy="15" rx="1.4" ry=".8" /><ellipse cx="24" cy="13" rx="1.4" ry=".8" /><ellipse cx="31" cy="15.5" rx="1.4" ry=".8" />
        <ellipse cx="21" cy="18" rx="1.4" ry=".8" /><ellipse cx="28" cy="19" rx="1.4" ry=".8" />
      </g>
      <path d="M7 25c3-2.5 5 1.5 8-1s5 1.5 8-1 5 1.5 8-1 5 1.5 10-.5v2H7z" fill="#6CC24A" />
      <path d="M9 26h30l-4 6-3-3-4 4-3-4-3 3-4-3z" fill="#FFD23F" />
      <rect x="8" y="27.5" width="32" height="6" rx="3" fill="#7B3F1D" />
      <path d="M9 35h30a1 1 0 011 1 5 5 0 01-5 5H13a5 5 0 01-5-5 1 1 0 011-1z" fill="#E8962E" />
    </svg>
  );
}

function Sushi() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="19" fill="#1F2D2B" />
      <circle cx="24" cy="24" r="15" fill="#FFFFFF" stroke="#E6E9EC" strokeWidth="1" />
      <g fill="#EEF1F3"><circle cx="15" cy="20" r="1.3" /><circle cx="32" cy="18" r="1.3" /><circle cx="31" cy="31" r="1.3" /><circle cx="17" cy="31" r="1.3" /></g>
      <circle cx="24" cy="24" r="7.5" fill="#FF7A59" />
      <path d="M19.5 22.5c3 1 6 1 9 0M19.5 26c3 1 6 1 9 0" stroke="#FFB19B" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="27.5" cy="20" r="2.2" fill="#7BC67E" />
    </svg>
  );
}

function Pizza() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <path d="M24 44L6.5 10.5a32 32 0 0135 0z" fill="#FFD45C" />
      <path d="M6.5 10.5a32 32 0 0135 0l-2.4 4.6a27 27 0 00-30.2 0z" fill="#E9A23B" />
      <g fill="#D9452B"><circle cx="20" cy="20" r="3.4" /><circle cx="29" cy="22" r="3" /><circle cx="24" cy="31" r="2.8" /></g>
      <g fill="#6CC24A"><circle cx="25" cy="17.5" r="1.1" /><circle cx="18" cy="27" r="1.1" /><circle cx="29.5" cy="29" r="1.1" /></g>
    </svg>
  );
}

export function FoodOrbit({ small = false }: { small?: boolean }) {
  return (
    <div className={`food-orbit${small ? " is-small" : ""}`} aria-hidden>
      <span className="food-orbit-ring">
        <span className="food-orbit-item"><Burger /></span>
        <span className="food-orbit-item"><Sushi /></span>
        <span className="food-orbit-item"><Pizza /></span>
      </span>
      <span className="food-orbit-center" />
    </div>
  );
}

export default function FoodLoader({ label = "Chargement…", detail }: { label?: string; detail?: string }) {
  return (
    <div className="food-loader" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-white px-8 pb-6 pt-7 text-center shadow-lg dark:bg-[#202124]">
        <FoodOrbit />
        <p className="text-[15px] font-medium text-[#202124] dark:text-[#e8eaed]">
          {label}
          {detail && <small className="mt-0.5 block text-[13px] font-normal text-[#5f6368] dark:text-[#9aa0a6]">{detail}</small>}
        </p>
      </div>
    </div>
  );
}
