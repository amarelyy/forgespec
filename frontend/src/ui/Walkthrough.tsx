import { memo, useEffect, useRef } from 'react';
import { Icon } from './Sprite';
import { initWalkthrough } from './walkthroughMotion';

const STEPS = [
  ['Search the part', 'Type a part number. No account needed.'],
  ['Specs arrive', 'Details come from the distributor and are turned into numbers.'],
  ['The check fails', 'The sensor needs 3.3 V, but the robot runs on 5 V.'],
  ['Fix it', 'Add a 3.3 V regulator. The row turns green.'],
  ['Save a version', 'The whole team sees the change in version 15.'],
] as const;

export const Walkthrough = memo(function Walkthrough() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return initWalkthrough(ref.current!, reduce);
  }, []);

  return (
    <section className="block" id="tour">
      <div className="wrap">
        <div className="sec-head">
          <h2>Watch one sensor go from search to saved</h2>
          <p>A robotics team needs a temperature sensor for their line-follower robot. Here is what happens.</p>
        </div>
        <div className="wt" ref={ref}>
          <div>
            <ol className="steps">
              {STEPS.map(([title, desc], i) => (
                <li key={title} className="step">
                  <button type="button">
                    <span className="n">{i + 1}</span>
                    <span className="t">{title}</span>
                    <span className="d">{desc}</span>
                    <span className="track"><span className="fill" /></span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="wt-ctrl">
              <button type="button" data-w="play">
                <Icon name="pause" />
                <span>Pause</span>
              </button>
            </div>
          </div>

          <div className="app" aria-label="Animated example of the ForgeSpec workspace">
            <div className="app-bar">
              <b>line-follower-bot</b>
              <span className="rev" data-w="rev">version 14</span>
              <span style={{ marginLeft: 'auto' }}>Component List</span>
            </div>
            <div className="app-body">
              <div className="a-search" data-w="search">
                <Icon name="search" />
                <span className="typed" data-w="typed" />
                <span className="caret" />
                <span data-w="ph">Search part number</span>
              </div>
              <div className="a-drop" data-w="drop">
                <div className="a-res">
                  <svg viewBox="0 0 40 40" aria-hidden="true">
                    <rect x="5" y="6" width="30" height="22" rx="2" fill="#6a3fb0" />
                    <rect x="15" y="12" width="10" height="10" rx="1" fill="#e9edf1" />
                    <rect x="11" y="28" width="2" height="5" fill="#9aa5b0" />
                    <rect x="17" y="28" width="2" height="5" fill="#9aa5b0" />
                    <rect x="23" y="28" width="2" height="5" fill="#9aa5b0" />
                    <rect x="29" y="28" width="2" height="5" fill="#9aa5b0" />
                  </svg>
                  <span>
                    <span className="mpn">BME280</span>
                    <div className="small">Temperature, humidity and pressure sensor</div>
                  </span>
                  <span className="add">Add</span>
                </div>
                <div className="a-specs">
                  <div className="spec"><span className="k">Supply</span><span className="raw">&quot;1.71V ~ 3.6V&quot;</span><span className="val">1.71 – 3.60 V</span></div>
                  <div className="spec"><span className="k">Draw</span><span className="raw">&quot;3.6µA @ 1Hz&quot;</span><span className="val">3.6 µA</span></div>
                  <div className="spec"><span className="k">Price</span><span className="raw">unit, qty 1</span><span className="val">$4.75</span></div>
                </div>
              </div>
              <table className="a-table">
                <tbody>
                  <tr><td><span className="mpn">LM7805CT</span><div className="small">5 V regulator, powers the robot</div></td><td className="r"><span className="pill p-ok">Pass</span></td></tr>
                  <tr><td><span className="mpn">ATMEGA328P-AU</span><div className="small">Microcontroller</div></td><td className="r"><span className="pill p-ok">Pass</span></td></tr>
                  <tr><td><span className="mpn">HC-SR04</span><div className="small">Distance sensor</div></td><td className="r"><span className="pill p-ok">Pass</span></td></tr>
                  <tr className="a-row" data-w="rams"><td><span className="mpn">AMS1117-3.3</span><div className="small">3.3 V regulator, new</div></td><td className="r"><span className="pill p-ok">Pass</span></td></tr>
                  <tr className="a-row" data-w="rbme">
                    <td><span className="mpn">BME280</span><div className="why" data-w="why">Checking…</div></td>
                    <td className="r" data-w="pill"><span className="pill p-warn">Checking</span></td>
                  </tr>
                </tbody>
              </table>
              <div className="a-foot">
                <span data-w="sum"><span className="pill p-ok">3 passed</span></span>
                <button type="button" className="a-commit" data-w="commit" tabIndex={-1} aria-hidden="true">Save version</button>
              </div>
              <div className="a-toast" data-w="toast">Version 15 saved · 2 parts added</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
