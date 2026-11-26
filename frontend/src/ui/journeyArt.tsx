/**
 * The five small drawings on the walkthrough map, one per stop. Line drawings in ink with one accent colour;
 * numbers are set in mono because they are data. Each animates only while its stop is active (the parent adds
 * .is-play); otherwise it shows its finished state.
 */

const Chip = ({ x, target = false }: { x: number; target?: boolean }) => (
  <g>
    <rect className={`ja-ln ${target ? 'ja-tgt' : 'ja-paper'}`} x={x} y="34" width="22" height="22" />
    <path className="ja-ln" d={`M${x + 5} 56v5M${x + 11} 56v5M${x + 17} 56v5`} />
  </g>
);

/** 1. Parts slide under the lens until the BME280 is found. */
export function ArtSearch() {
  return (
    <svg viewBox="0 0 200 120" className="ja">
      <defs>
        <clipPath id="ja-belt">
          <rect x="0" y="20" width="200" height="50" />
        </clipPath>
      </defs>
      <g clipPath="url(#ja-belt)">
        <g className="ja-belt">
          <Chip x={13} />
          <Chip x={51} />
          <Chip x={89} target />
          <Chip x={127} />
          <Chip x={165} />
        </g>
      </g>
      <circle className="ja-ln ja-lens" cx="100" cy="45" r="25" />
      <path className="ja-ln ja-lens" d="M118 63l17 17" />
      <text className="ja-val is-em ja-found" x="100" y="108" textAnchor="middle">
        BME280
      </text>
    </svg>
  );
}

/** 2. A parcel drives from the distributor to the datasheet; the numbers come out when it arrives. */
export function ArtSpecs() {
  return (
    <svg viewBox="0 0 200 120" className="ja">
      <path className="ja-ln" d="M8 96V70l18-13 18 13v26z" />
      <path className="ja-ln" d="M20 96V83h12v13" />
      <path className="ja-ln ja-road" d="M50 96H146" />
      <path className="ja-ln ja-paper" d="M154 58h26l10 10v28h-36z" />
      <path className="ja-ln" d="M180 58v10h10M160 74h22M160 81h22M160 88h14" />
      <g className="ja-parcel">
        <rect className="ja-ln ja-paper" x="124" y="80" width="20" height="16" />
        <path className="ja-ln ja-lid" d="M124 80h20" />
        <path className="ja-ln" d="M134 80v16" />
      </g>
      <text className="ja-val ja-out2" x="172" y="24" textAnchor="middle">
        3.6 µA
      </text>
      <text className="ja-val is-em ja-out1" x="172" y="44" textAnchor="middle">
        1.71–3.6 V
      </text>
    </svg>
  );
}

const X = (v: number) => 14 + v * (172 / 6); // volts to x on the ruler

/** 3. The 5 V rail lands outside the sensor's 1.71–3.6 V range. */
export function ArtCheck() {
  return (
    <svg viewBox="0 0 200 120" className="ja">
      <defs>
        <pattern id="ja-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="ja-hatch" x1="0" y1="0" x2="0" y2="6" />
        </pattern>
      </defs>
      <text className="ja-val" x={(X(1.71) + X(3.6)) / 2} y="50" textAnchor="middle">
        1.71–3.6 V
      </text>
      <rect className="ja-ln" x={X(1.71)} y="58" width={X(3.6) - X(1.71)} height="30" fill="url(#ja-hatch)" />
      <path className="ja-ln" d={`M14 88H186${[0, 1, 2, 3, 4, 5, 6].map((v) => `M${X(v)} 88v6`).join('')}`} />
      <text className="ja-val" x="14" y="112" textAnchor="middle">
        0
      </text>
      <text className="ja-val" x="186" y="112" textAnchor="middle">
        6 V
      </text>
      <g className="ja-needle">
        <path className="ja-ln" d={`M${X(5)} 30V94`} />
        <text className="ja-val" x={X(5)} y="22" textAnchor="middle">
          5 V
        </text>
      </g>
      <path className="ja-cross" d="M170 60l10 10M180 60l-10 10" />
    </svg>
  );
}

/** 4. A regulator drops in and steps 5 V down to 3.3 V; the sensor turns green. */
export function ArtFix() {
  return (
    <svg viewBox="0 0 200 120" className="ja">
      <text className="ja-val" x="10" y="34">
        5 V
      </text>
      <path className="ja-ln" d="M10 44H82M118 74H164" />
      <text className="ja-val" x="124" y="66">
        3.3 V
      </text>
      <g className="ja-reg">
        <rect className="ja-ln ja-paper" x="82" y="30" width="36" height="50" />
        <circle className="ja-ln" cx="100" cy="42" r="4" />
        <path className="ja-ln" d="M90 80v10M100 80v10M110 80v10" />
      </g>
      <path className="ja-flow" d="M10 44H100V74H164" />
      <rect className="ja-ln ja-ok" x="164" y="64" width="20" height="20" />
      <path className="ja-check" d="M169 74l4 4 7-9" />
      <text className="ja-val" x="174" y="106" textAnchor="middle">
        BME280
      </text>
    </svg>
  );
}

const plate = (y: number) => `88,${y + 36} 150,${y + 18} 88,${y} 26,${y + 18}`;

/** 5. Version 15 drops onto the stack. */
export function ArtSave() {
  return (
    <svg viewBox="0 0 200 120" className="ja">
      <polygon className="ja-ln ja-paper" points={plate(56)} />
      <polygon className="ja-ln ja-paper" points={plate(42)} />
      <polygon className="ja-v15" points={plate(28)} />
      <text className="ja-val" x="160" y="78">
        v13
      </text>
      <text className="ja-val" x="160" y="64">
        v14
      </text>
      <text className="ja-val is-em ja-saved" x="160" y="50">
        v15
      </text>
      <text className="ja-val ja-saved" x="88" y="112" textAnchor="middle">
        2 parts added
      </text>
    </svg>
  );
}
