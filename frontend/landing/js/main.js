(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const setIcon = (btn, name, label) => { btn.querySelector("use").setAttribute("href", "#i-" + name); btn.setAttribute("aria-label", label); const t = btn.querySelector("span"); if(t) t.textContent = label.split(" ")[0]; };

  // ---------- part drawer ----------
  const MULT = {p:1e-12,n:1e-9,"µ":1e-6,u:1e-6,m:1e-3,k:1e3,M:1e6};
  const parse = (str, unit) => { const re = new RegExp("(\\d+(?:\\.\\d+)?)\\s*([pnµumkM])?" + unit, "g"), out = []; let m; while((m = re.exec(str))) out.push(parseFloat(m[1]) * (m[2] ? MULT[m[2]] : 1)); return out; };
  const fmtV = r => r.length > 1 ? `${r[0]} – ${r[r.length-1]} V` : `${r[0]} V`;
  const fmtA = a => a >= 1 ? a.toFixed(2) + " A" : a >= 1e-3 ? +(a*1e3).toFixed(1) + " mA" : +(a*1e6).toFixed(1) + " µA";
  const pins = (n,y)=>Array.from({length:n},(_,i)=>`<rect x="${8+i*(24/(n-1||1))-1}" y="${y}" width="2" height="5" fill="#9aa5b0"/>`).join("");
  const ICON = {
    mcu:`<rect x="8" y="8" width="24" height="24" rx="2" fill="#1d232b"/>${[0,1,2,3,4].map(i=>`<rect x="${10+i*5}" y="4" width="2" height="4" fill="#9aa5b0"/><rect x="${10+i*5}" y="32" width="2" height="4" fill="#9aa5b0"/><rect x="4" y="${10+i*5}" width="4" height="2" fill="#9aa5b0"/><rect x="32" y="${10+i*5}" width="4" height="2" fill="#9aa5b0"/>`).join("")}<circle cx="13" cy="13" r="1.6" fill="#59636e"/>`,
    module:`<rect x="6" y="5" width="28" height="22" rx="1.5" fill="#1f5fb0"/><rect x="14" y="10" width="12" height="12" fill="#c7ced5"/>${pins(5,27)}`,
    reg:`<rect x="10" y="4" width="20" height="8" rx="1" fill="#9aa5b0"/><circle cx="20" cy="8" r="2" fill="#5c6670"/><rect x="10" y="12" width="20" height="14" rx="1" fill="#1d232b"/><rect x="13" y="26" width="2" height="10" fill="#9aa5b0"/><rect x="19" y="26" width="2" height="10" fill="#9aa5b0"/><rect x="25" y="26" width="2" height="10" fill="#9aa5b0"/>`,
    sensor:`<rect x="5" y="6" width="30" height="22" rx="2" fill="#6a3fb0"/><rect x="15" y="12" width="10" height="10" rx="1" fill="#e9edf1"/><circle cx="9" cy="10" r="1.6" fill="#e9edf1"/><circle cx="31" cy="10" r="1.6" fill="#e9edf1"/>${pins(4,28)}`,
    sonar:`<rect x="1" y="9" width="38" height="20" rx="2" fill="#1f5fb0"/><circle cx="10" cy="19" r="7.5" fill="#cfd6dc"/><circle cx="10" cy="19" r="4.5" fill="#3a434c"/><circle cx="30" cy="19" r="7.5" fill="#cfd6dc"/><circle cx="30" cy="19" r="4.5" fill="#3a434c"/>`,
    servo:`<rect x="4" y="14" width="30" height="14" rx="1.5" fill="#1d232b"/><rect x="1" y="18" width="36" height="6" rx="1" fill="#1d232b"/><circle cx="12" cy="21" r="5" fill="#e9edf1"/><rect x="10" y="6" width="4" height="15" rx="2" fill="#e9edf1"/>`,
    driver:`<rect x="6" y="10" width="28" height="20" rx="1.5" fill="#1d232b"/>${[0,1,2,3,4,5].map(i=>`<rect x="${8+i*4.6}" y="6" width="2" height="4" fill="#9aa5b0"/><rect x="${8+i*4.6}" y="30" width="2" height="4" fill="#9aa5b0"/>`).join("")}`,
    res:`<g transform="rotate(-30 20 20)"><line x1="2" y1="20" x2="38" y2="20" stroke="#9aa5b0" stroke-width="1.8"/><rect x="11" y="15" width="18" height="10" rx="4" fill="#d8b685"/><rect x="15" y="15" width="2" height="10" fill="#8a4b2b"/><rect x="19" y="15" width="2" height="10" fill="#1d232b"/><rect x="23" y="15" width="2" height="10" fill="#e07b1a"/></g>`,
    cap:`<rect x="10" y="13" width="20" height="14" rx="2" fill="#b98a52"/><rect x="6" y="13" width="5" height="14" fill="#c7ced5"/><rect x="29" y="13" width="5" height="14" fill="#c7ced5"/>`,
    conn:`<rect x="7" y="10" width="26" height="20" rx="1.5" fill="#f1f3f5" stroke="#9aa5b0"/><rect x="13" y="15" width="4" height="8" fill="#c79a2b"/><rect x="23" y="15" width="4" height="8" fill="#c79a2b"/>`
  };
  const icon = k => `<svg class="part" viewBox="0 0 40 40" aria-hidden="true">${ICON[k]}</svg>`;
  const CAT = [
    ["Microcontrollers",[
      {mpn:"ATMEGA328P-AU",d:"8-bit AVR microcontroller",ic:"mcu",v:"1.8V ~ 5.5V",i:"12mA",p:2.89,pkg:"TQFP-32",kw:"arduino avr"},
      {mpn:"ESP32-WROOM-32E",d:"Wi-Fi and Bluetooth module",ic:"module",v:"3.0V ~ 3.6V",i:"240mA",p:3.10,pkg:"SMD module",kw:"wifi bluetooth espressif"},
      {mpn:"STM32F407VGT6",d:"Cortex-M4 microcontroller, 168 MHz",ic:"mcu",v:"1.8V ~ 3.6V",i:"90mA",p:11.20,pkg:"LQFP-100",kw:"stm32 arm"},
      {mpn:"RP2040",d:"Dual-core Cortex-M0+",ic:"mcu",v:"1.62V ~ 3.63V",i:"25mA",p:0.80,pkg:"QFN-56",kw:"pico raspberry"}]],
    ["Power",[
      {mpn:"LM7805CT",d:"5 V linear regulator",ic:"reg",v:"7V ~ 35V",i:"1.5A",p:0.62,pkg:"TO-220",kw:"regulator 5v",ilbl:"Output"},
      {mpn:"AMS1117-3.3",d:"3.3 V low-dropout regulator",ic:"reg",v:"4.75V ~ 15V",i:"1A",p:0.18,pkg:"SOT-223",kw:"ldo regulator 3.3v",ilbl:"Output"}]],
    ["Sensors",[
      {mpn:"BME280",d:"Temperature, humidity and pressure sensor",ic:"sensor",v:"1.71V ~ 3.6V",i:"3.6µA",p:4.75,pkg:"LGA-8",kw:"temperature humidity bosch weather"},
      {mpn:"MPU-6050",d:"Accelerometer and gyroscope",ic:"sensor",v:"2.375V ~ 3.46V",i:"3.9mA",p:2.10,pkg:"QFN-24",kw:"imu gyro accelerometer tilt"},
      {mpn:"HC-SR04",d:"Ultrasonic distance module",ic:"sonar",v:"5V",i:"15mA",p:1.95,pkg:"Module, 4-pin",kw:"distance ultrasonic sonar"}]],
    ["Motors",[
      {mpn:"MG996R",d:"Metal-gear servo",ic:"servo",v:"4.8V ~ 7.2V",i:"2.5A",p:6.40,pkg:"Servo, 3-wire",kw:"servo motor",ilbl:"Stall"},
      {mpn:"DRV8833PWPR",d:"Dual H-bridge motor driver",ic:"driver",v:"2.7V ~ 10.8V",i:"1.5A",p:1.85,pkg:"HTSSOP-16",kw:"motor driver h-bridge",ilbl:"Output"}]],
    ["Passives",[
      {mpn:"RC0603FR-0710KL",d:"10 kΩ resistor",ic:"res",rating:"0.1W",p:0.01,pkg:"0603",kw:"resistor 10k"},
      {mpn:"CL10B104KB8NNNC",d:"100 nF ceramic capacitor",ic:"cap",rating:"50V",p:0.02,pkg:"0603",kw:"capacitor decoupling 100nf"}]],
    ["Connectors",[
      {mpn:"B2B-XH-A",d:"JST XH 2-pin header",ic:"conn",i:"3A",p:0.11,pkg:"Through-hole",kw:"jst battery connector",ilbl:"Rated"}]]
  ];
  const plist = $("plist"), q = $("q"), chips = $("chips");
  let cat = "All", open = null;
  chips.innerHTML = ["All", ...CAT.map(c=>c[0])].map(c=>`<button type="button" aria-pressed="${c==="All"}" data-c="${c}">${c}</button>`).join("");
  chips.addEventListener("click", e => { const b = e.target.closest("button"); if(!b) return; cat = b.dataset.c; [...chips.children].forEach(x=>x.setAttribute("aria-pressed", x===b)); renderList(); plist.scrollTop = 0; });
  function specRows(p){
    const rows = [];
    if(p.v) rows.push(["Supply", p.v, fmtV(parse(p.v,"V"))]);
    if(p.rating){ const u = p.rating.endsWith("W") ? "W" : "V"; rows.push(["Rated", p.rating, parse(p.rating,u)[0] + " " + u]); }
    if(p.i) rows.push([p.ilbl || "Draw", p.i, fmtA(parse(p.i,"A")[0])]);
    rows.push(["Package", p.pkg, ""]);
    rows.push(["Price", "unit, qty 1", "$" + p.p.toFixed(2)]);
    return rows.map(([k,raw,val]) => `<div class="spec"><span class="k">${k}</span><span class="raw">${val ? `"${esc(raw)}"` : esc(raw)}</span><span class="val">${val}</span></div>`).join("");
  }
  function renderList(){
    const t = q.value.trim().toLowerCase(); let h = "", n = 0;
    CAT.forEach(([c,items]) => {
      if(cat !== "All" && c !== cat) return;
      const hits = items.filter(p => !t || (p.mpn+" "+p.d+" "+p.kw+" "+c).toLowerCase().includes(t));
      if(!hits.length) return;
      n += hits.length;
      h += `<div class="pgroup">${c} <span>${hits.length}</span></div>`;
      hits.forEach(p => {
        const isOpen = open === p.mpn;
        h += `<button type="button" class="pitem" aria-expanded="${isOpen}" data-m="${p.mpn}">${icon(p.ic)}<span style="min-width:0"><span class="nm">${p.mpn}</span><span class="sp">${esc(p.d)}</span></span><svg class="ico chev" aria-hidden="true"><use href="#i-chev"/></svg></button>`;
        if(isOpen) h += `<div class="pdetail">${specRows(p)}<div class="save"><span>Read from the distributor listing</span><a href="#register"><svg class="ico" style="width:14px;height:14px" aria-hidden="true"><use href="#i-lock"/></svg>Log in to save</a></div></div>`;
      });
    });
    if(!n) h = `<div class="pempty"><strong>Component not found</strong><p>No result for "${esc(q.value.trim())}"${cat!=="All"?` in ${cat}`:""}. You can add the part yourself.</p><a class="btn" href="#register">Create custom part</a></div>`;
    plist.innerHTML = h;
    $("rcount").textContent = `${n} part${n===1?"":"s"} in this sample`;
  }
  q.addEventListener("input", () => { open = null; renderList(); });
  plist.addEventListener("click", e => { const b = e.target.closest(".pitem"); if(!b) return; open = open === b.dataset.m ? null : b.dataset.m; renderList(); plist.querySelector(`[data-m="${CSS.escape(b.dataset.m)}"]`)?.focus({preventScroll:true}); });
  document.addEventListener("keydown", e => { if(e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)){ e.preventDefault(); q.focus(); q.scrollIntoView({block:"center", behavior:"smooth"}); } });
  open = "BME280"; renderList();

  // ---------- moving carousel: advances when the progress bar finishes ----------
  const car = $("car"), reel = $("reel"), slides = [...reel.children], dots = $("dots"), cplay = $("cplay");
  dots.innerHTML = slides.map((s,i)=>`<button type="button" class="dot" aria-label="Go to slide ${i+1}: ${s.dataset.label}"><span class="fill"></span></button>`).join("");
  const dotBtns = [...dots.children];
  car.style.setProperty("--dur", "4s");
  let ci = 0, userPaused = reduce;
  function show(i){
    ci = (i + slides.length) % slides.length;
    reel.style.transform = `translateX(-${ci*100}%)`;
    slides.forEach((s,k)=>{ s.setAttribute("aria-hidden", k!==ci); s.inert = k!==ci; });
    dotBtns.forEach((d,k)=>{ d.classList.toggle("done", k<ci); d.removeAttribute("aria-current"); });
    void dots.offsetWidth; // restart the fill animation
    dotBtns[ci].setAttribute("aria-current","true");
  }
  // keeps moving on hover and after arrow clicks; only the pause button stops it
  const syncCar = () => car.classList.toggle("paused", userPaused);
  dotBtns.forEach((d,k)=>{ d.onclick = () => show(k); d.querySelector(".fill").addEventListener("animationend", () => show(ci+1)); });
  $("cprev").onclick = () => show(ci-1);
  $("cnext").onclick = () => show(ci+1);
  cplay.onclick = () => { userPaused = !userPaused; setIcon(cplay, userPaused ? "play" : "pause", userPaused ? "Play slideshow" : "Pause slideshow"); syncCar(); };
  let sx = null;
  $("vp").addEventListener("pointerdown", e => { sx = e.clientX; });
  $("vp").addEventListener("pointerup", e => { if(sx === null) return; const dx = e.clientX - sx; sx = null; if(Math.abs(dx) > 50) show(ci + (dx < 0 ? 1 : -1)); });
  if(reduce) setIcon(cplay, "play", "Play slideshow");
  show(0); syncCar();

  // ---------- walkthrough: one use case, five scenes ----------
  const wt = $("wt"), steps = [...$("steps").children], wplay = $("wplay");
  const DUR = [3800, 4200, 4200, 4200, 4000];
  const el = { search:$("asearch"), typed:$("atyped"), ph:$("aph"), drop:$("adrop"), rams:$("rams"), rbme:$("rbme"), why:$("bwhy"), pill:$("bpill"), sum:$("asum"), commit:$("acommit"), toast:$("atoast"), rev:$("arev") };
  let si = 0, timers = [], wPaused = reduce, wHover = false;
  const later = (ms, fn) => timers.push(setTimeout(fn, reduce ? 0 : ms));
  const sum = (ok, err) => el.sum.innerHTML = (err ? `<span class="pill p-err">${err} error</span> ` : "") + `<span class="pill p-ok">${ok} passed</span>`;
  function scene(i){
    timers.forEach(clearTimeout); timers = [];
    const typed = i >= 1, specs = i >= 1, added = i >= 2, fixed = i >= 3, saved = i >= 4;
    // search + result
    el.search.classList.toggle("on", i <= 1);
    el.typed.textContent = typed ? "BME280" : ""; el.ph.hidden = typed || i === 0;
    el.drop.classList.toggle("show", i === 1); el.drop.classList.toggle("ready", i === 1); el.drop.classList.toggle("specs", false);
    if(i === 0){
      el.drop.classList.remove("show","ready");
      const word = "BME280"; [...word].forEach((ch,k) => later(500 + k*170, () => { el.typed.textContent += ch; }));
      later(500 + word.length*170 + 300, () => el.drop.classList.add("show"));
      later(500 + word.length*170 + 700, () => el.drop.classList.add("ready"));
    }
    if(i === 1) later(250, () => el.drop.classList.add("specs"));
    if(i >= 2){ el.typed.textContent = ""; el.ph.hidden = false; }
    // table
    el.rbme.classList.toggle("show", added);
    el.rams.classList.toggle("show", fixed);
    el.rbme.classList.remove("bad","good");
    el.commit.classList.remove("ready","press"); el.toast.classList.remove("show"); el.rev.classList.remove("bump");
    el.rev.textContent = saved ? "version 15" : "version 14";
    if(!added) sum(3, 0);
    if(i === 2){
      el.why.textContent = "Checking against the 5 V rail…"; el.pill.innerHTML = `<span class="pill p-warn">Checking</span>`; sum(3, 0);
      later(1100, () => { el.rbme.classList.add("bad"); el.why.textContent = "Needs 1.71 – 3.6 V, but the rail is 5 V"; el.pill.innerHTML = `<span class="pill p-err">Error</span>`; sum(3, 1); });
    }
    if(i >= 3){
      el.rbme.classList.add("good"); el.why.textContent = "Now powered from the 3.3 V regulator"; el.pill.innerHTML = `<span class="pill p-ok">Pass</span>`; sum(5, 0);
      el.commit.classList.add("ready");
    }
    if(i === 4){
      el.rev.textContent = "version 14";
      later(700, () => el.commit.classList.add("press"));
      later(900, () => { el.commit.classList.remove("press"); el.toast.classList.add("show"); el.rev.textContent = "version 15"; el.rev.classList.add("bump"); });
    }
  }
  function go(i){
    si = (i + steps.length) % steps.length;
    steps.forEach((s,k)=>{ s.classList.toggle("done", k < si); s.removeAttribute("aria-current"); s.style.setProperty("--dur", DUR[k] + "ms"); });
    void wt.offsetWidth;
    steps[si].setAttribute("aria-current","true");
    scene(si);
  }
  const syncWt = () => wt.classList.toggle("paused", wPaused || wHover || offscreen);
  steps.forEach((s,k)=>{ s.querySelector("button").onclick = () => go(k); s.querySelector(".fill").addEventListener("animationend", () => go(si+1)); });
  wplay.onclick = () => { wPaused = !wPaused; setIcon(wplay, wPaused ? "play" : "pause", wPaused ? "Play" : "Pause"); syncWt(); };
  const app = wt.querySelector(".app");
  app.addEventListener("pointerenter", () => { wHover = true; syncWt(); });
  app.addEventListener("pointerleave", () => { wHover = false; syncWt(); });
  if(reduce) setIcon(wplay, "play", "Play");
  // hold on scene 1 until the section scrolls into view, then play from the start
  let offscreen = !reduce;
  const syncHold = () => wt.classList.toggle("paused", wPaused || wHover || offscreen);
  wt.classList.toggle("paused", true);
  go(0); syncHold();
  if(!reduce) new IntersectionObserver((es,o) => es.forEach(e => { if(e.isIntersecting){ o.disconnect(); offscreen = false; go(0); syncHold(); } }), {threshold:.35}).observe(wt);
})();
