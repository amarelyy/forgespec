import { memo, useEffect, useRef } from 'react';
import { initCarousel } from './carouselMotion';
import { Icon } from './Sprite';

const SLIDES = ['Catch wrong parts', 'Compare versions', 'Specs read for you', 'Export for suppliers'];

export const Carousel = memo(function Carousel() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return initCarousel(ref.current!, reduce);
  }, []);

  return (
    <section id="features">
      <div className="wrap">
        <div className="carousel" ref={ref} aria-roledescription="carousel" aria-label="What ForgeSpec does">
          <div className="viewport">
            <div className="reel" aria-live="off">
              <div className="slide" role="group" aria-roledescription="slide" aria-label="1 of 4">
                <div className="slide-copy">
                  <h3>Catch wrong parts before you buy</h3>
                  <p>Every part in your list is checked against your power supply. Problems turn red right away.</p>
                </div>
                <div className="pic">
                  <table>
                    <tbody>
                      <tr>
                        <td><span className="mpn">LM7805CT</span><div className="small">5 V regulator</div></td>
                        <td className="r"><span className="pill p-ok">Pass</span></td>
                      </tr>
                      <tr>
                        <td><span className="mpn">ATMEGA328P-AU</span><div className="small">Microcontroller</div></td>
                        <td className="r"><span className="pill p-ok">Pass</span></td>
                      </tr>
                      <tr className="bad">
                        <td><span className="mpn">BME280</span><div className="why">Needs 1.71 – 3.6 V, but your rail is 5 V</div></td>
                        <td className="r"><span className="pill p-err">Error</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="slide" role="group" aria-roledescription="slide" aria-label="2 of 4">
                <div className="slide-copy">
                  <h3>See what changed between versions</h3>
                  <p>Every save is a version. Compare any two and see what was added, removed or changed.</p>
                </div>
                <div className="pic">
                  <div className="small" style={{ marginBottom: 10 }}>Version 12 → version 14</div>
                  <table>
                    <tbody>
                      <tr className="d-add">
                        <td className="d-sign">+</td>
                        <td><span className="mpn">DRV8833PWPR</span><div className="small">Motor driver added</div></td>
                        <td className="r small">qty 1</td>
                      </tr>
                      <tr className="d-rem">
                        <td className="d-sign">−</td>
                        <td><span className="mpn">L298N</span><div className="small">Old driver removed</div></td>
                        <td className="r small">qty 1</td>
                      </tr>
                      <tr className="d-mod">
                        <td className="d-sign">~</td>
                        <td><span className="mpn">CL10B104KB8NNNC</span><div className="small">Quantity changed</div></td>
                        <td className="r small"><span className="old">4</span> → 6</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="slide" role="group" aria-roledescription="slide" aria-label="3 of 4">
                <div className="slide-copy">
                  <h3>Specs are read for you</h3>
                  <p>Datasheet text is turned into numbers the checks can use. If one is wrong, type the right value.</p>
                </div>
                <div className="pic">
                  <div className="parse">
                    <span className="raw">&quot;5.5V&quot;</span>
                    <Icon name="right" size={28} className="arrow" />
                    <span className="num">
                      5.5 V <Icon name="pen" />
                    </span>
                  </div>
                  <div className="small" style={{ textAlign: 'center' }}>ATMEGA328P-AU · maximum supply voltage</div>
                </div>
              </div>

              <div className="slide" role="group" aria-roledescription="slide" aria-label="4 of 4">
                <div className="slide-copy">
                  <h3>Export a clean list for suppliers</h3>
                  <p>Download your parts list with quantities, prices and the total cost.</p>
                </div>
                <div className="pic">
                  <pre className="csv">
                    {'part,qty,unit_price,total\nLM7805CT,1,0.62,0.62\nATMEGA328P-AU,1,2.89,2.89\nHC-SR04,2,1.95,3.90\n'}
                    <b>TOTAL,,,7.41</b>
                  </pre>
                  <div className="exp-btns"><span>CSV</span><span>PDF</span></div>
                </div>
              </div>
            </div>
          </div>

          <button type="button" className="arrow-btn prev" aria-label="Previous slide"><Icon name="left" /></button>
          <button type="button" className="arrow-btn next" aria-label="Next slide"><Icon name="right" /></button>
          <button type="button" className="car-pause" aria-label="Pause slideshow"><Icon name="pause" /></button>
          <div className="car-dots">
            {SLIDES.map((label, i) => (
              <button key={label} type="button" className="dot" aria-label={`Go to slide ${i + 1}: ${label}`}>
                <span className="fill" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
