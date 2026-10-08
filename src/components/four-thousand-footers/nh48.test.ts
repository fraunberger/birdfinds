import { test } from "node:test";
import assert from "node:assert/strict";

import {
    PEAKS,
    RANGES,
    PEAK_BY_ID,
    elevationRank,
    nearestPeak,
    superlatives,
    bearingName,
} from "./peaks";
import {
    EMPTY_LOG,
    formatDate,
    isValidDate,
    mergeLogs,
    parseLog,
    todayISO,
    withAscent,
    withAscentChanged,
    withoutPeak,
    type Ascent,
    type PeakLog,
} from "./log";
import { isWinterDate, statusByPeak, summarize, toCsv } from "./stats";
import {
    OVERVIEW,
    buildScene,
    facingName,
    MAX_RADIUS,
    MIN_RADIUS,
    anchorUnder,
    WORLD_REACH,
    focusView,
    getBasemap,
    layoutLabels,
    makeCamera,
    mapHeight,
    profileShape,
    panView,
    project,
    toLocal,
    zoomView,
    type Box,
} from "./scene";
import { mix } from "./palette";
import { dayNumber, monthLayout, niceScale, skylineLayout, timeTicks, timelineLayout } from "./charts";

// ---- helpers ---------------------------------------------------------------

function log(...entries: Array<[string, string, string?]>): PeakLog {
    return parseLog(entries.map(([peakId, date, notes], i) => ({ id: `a${i}`, peakId, date, notes })));
}

function overlapping(a: Box, b: Box): boolean {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

// ---- the list --------------------------------------------------------------

test("there are 48 peaks, all over 4,000 ft, in AMC list order", () => {
    assert.equal(PEAKS.length, 48);
    assert.equal(new Set(PEAKS.map((p) => p.id)).size, 48);
    for (const p of PEAKS) assert.ok(p.elevation >= 4000, p.id);
    for (let i = 1; i < PEAKS.length; i++) {
        assert.ok(PEAKS[i - 1].elevation >= PEAKS[i].elevation, `${PEAKS[i - 1].id} before ${PEAKS[i].id}`);
    }
    assert.equal(PEAKS[0].id, "washington");
    assert.equal(PEAKS[47].id, "tecumseh");
});

test("every peak sits in the White Mountains and in a known range", () => {
    const ranges = new Set(RANGES.map((r) => r.id));
    for (const p of PEAKS) {
        assert.ok(ranges.has(p.range), p.id);
        assert.ok(p.lat > 43.9 && p.lat < 44.55, `${p.id} lat`);
        assert.ok(p.lon > -71.9 && p.lon < -71.1, `${p.id} lon`);
    }
    // Every range has at least one peak, and together they hold all 48.
    for (const r of RANGES) assert.ok(PEAKS.some((p) => p.range === r.id), r.id);
});

test("ranks share ties: Field and Osceola are both 23rd", () => {
    assert.equal(elevationRank(PEAK_BY_ID.get("washington")!), 1);
    assert.equal(elevationRank(PEAK_BY_ID.get("field")!), 23);
    assert.equal(elevationRank(PEAK_BY_ID.get("osceola")!), 23);
    assert.equal(elevationRank(PEAK_BY_ID.get("flume")!), 25);
    assert.equal(elevationRank(PEAK_BY_ID.get("tecumseh")!), 48);
});

test("neighbors and superlatives come out of the coordinates", () => {
    const lincoln = PEAK_BY_ID.get("lincoln")!;
    const near = nearestPeak(lincoln);
    assert.equal(near.peak.id, "lafayette");
    assert.ok(near.miles > 0.6 && near.miles < 1, `${near.miles}`);
    assert.equal(bearingName(lincoln, near.peak), "N");

    assert.deepEqual(superlatives(PEAK_BY_ID.get("cabot")!), ["Northernmost of the 48."]);
    assert.deepEqual(superlatives(PEAK_BY_ID.get("whiteface")!), ["Southernmost of the 48."]);
    assert.deepEqual(superlatives(PEAK_BY_ID.get("moriah")!), ["Easternmost of the 48."]);
    assert.deepEqual(superlatives(PEAK_BY_ID.get("moosilauke")!), ["Westernmost of the 48."]);
    assert.deepEqual(superlatives(PEAK_BY_ID.get("tecumseh")!), ["Lowest of the 48."]);
    assert.deepEqual(superlatives(PEAK_BY_ID.get("bond")!), []);
});

// ---- the log ---------------------------------------------------------------

test("dates must be real calendar days", () => {
    assert.ok(isValidDate("2024-02-29"));
    assert.ok(!isValidDate("2023-02-29"));
    assert.ok(!isValidDate("2024-13-01"));
    assert.ok(!isValidDate("2024-1-01"));
    assert.ok(!isValidDate(""));
    assert.equal(formatDate("2025-08-12"), "Aug 12, 2025");
    assert.equal(todayISO(new Date(2026, 0, 5)), "2026-01-05");
});

test("parseLog keeps only well-formed ascents of real peaks", () => {
    const parsed = parseLog({
        version: 1,
        ascents: [
            { id: "b", peakId: "lafayette", date: "2025-08-12", notes: "ridge loop" },
            { id: "a", peakId: "lincoln", date: "2025-08-12" },
            { id: "a", peakId: "flume", date: "2025-08-13", notes: "" }, // duplicate id
            { id: "c", peakId: "mount-doom", date: "2025-08-13", notes: "" },
            { id: "d", peakId: "flume", date: "2025-02-30", notes: "" },
            null,
            "nonsense",
        ],
    });
    assert.deepEqual(
        parsed.ascents.map((a) => [a.id, a.peakId, a.notes]),
        [
            ["a", "lincoln", ""],
            ["b", "lafayette", "ridge loop"],
        ]
    );
    assert.deepEqual(parseLog("garbage"), EMPTY_LOG);
    assert.deepEqual(parseLog(undefined), EMPTY_LOG);
});

test("edits keep the log sorted and refuse impossible dates", () => {
    let l = log(["tom", "2025-06-01"]);
    const later: Ascent = { id: "z", peakId: "field", date: "2025-05-01", notes: "" };
    l = withAscent(l, later);
    assert.deepEqual(l.ascents.map((a) => a.peakId), ["field", "tom"]);
    assert.equal(withAscentChanged(l, "z", { date: "2025-02-31" }), l);
    l = withAscentChanged(l, "z", { date: "2025-07-01", notes: "in the rain" });
    assert.deepEqual(l.ascents.map((a) => [a.peakId, a.notes]), [["tom", ""], ["field", "in the rain"]]);
    assert.deepEqual(withoutPeak(l, "tom").ascents.map((a) => a.peakId), ["field"]);
});

test("importing a backup twice adds nothing the second time", () => {
    const mine = log(["washington", "2024-07-04", "fog"]);
    const backup = parseLog([
        { id: "x1", peakId: "washington", date: "2024-07-04", notes: "fog" }, // same climb, new id
        { id: "x2", peakId: "monroe", date: "2024-07-04", notes: "" },
    ]);
    const once = mergeLogs(mine, backup);
    assert.equal(once.added, 1);
    const twice = mergeLogs(once.log, backup);
    assert.equal(twice.added, 0);
    assert.equal(twice.log.ascents.length, 2);
});

// ---- stats -----------------------------------------------------------------

test("calendar winter runs December 21 through March 20", () => {
    assert.ok(!isWinterDate("2024-12-20"));
    assert.ok(isWinterDate("2024-12-21"));
    assert.ok(isWinterDate("2025-01-15"));
    assert.ok(isWinterDate("2025-02-28"));
    assert.ok(isWinterDate("2025-03-20"));
    assert.ok(!isWinterDate("2025-03-21"));
    assert.ok(!isWinterDate("2025-07-04"));
});

test("summary counts first ascents once and groups same-day bags", () => {
    const l = log(
        ["lafayette", "2025-08-12"],
        ["lincoln", "2025-08-12"],
        ["lafayette", "2026-01-10", "winter repeat"],
        ["washington", "2024-07-04"]
    );
    const status = statusByPeak(l);
    const s = summarize(status);
    assert.equal(s.bagged, 3);
    assert.equal(s.ascents, 4);
    assert.equal(s.summitFeet, 5260 + 5089 + 6288);
    assert.equal(s.winterPeaks, 1);
    assert.equal(s.gridCells, 4); // Lafayette Aug + Jan, Lincoln Aug, Washington Jul
    assert.deepEqual(
        s.timeline.map((t) => [t.date, t.count, t.peaks.map((p) => p.id)]),
        [
            ["2024-07-04", 1, ["washington"]],
            ["2025-08-12", 3, ["lafayette", "lincoln"]],
        ]
    );
    assert.equal(s.byMonth[7], 2);
    assert.equal(s.firstDate, "2024-07-04");
    assert.equal(s.latestDate, "2026-01-10");
    assert.equal(s.finishedOn, null);
    assert.equal(s.highestRemaining?.id, "adams");
    assert.equal(status.get("lafayette")!.first!.date, "2025-08-12");
    assert.equal(status.get("lafayette")!.latest!.date, "2026-01-10");
    const franconia = s.byRange.find((r) => r.range.id === "franconia")!;
    assert.equal(franconia.bagged, 2);
    assert.equal(franconia.peaks.length, 4);
});

test("the 48th peak finishes the list", () => {
    const l = parseLog(PEAKS.map((p, i) => ({ id: `f${i}`, peakId: p.id, date: i === 47 ? "2026-09-01" : "2026-08-01" })));
    const s = summarize(statusByPeak(l));
    assert.equal(s.bagged, 48);
    assert.equal(s.finishedOn, "2026-09-01");
    assert.equal(s.highestRemaining, null);
});

// ---- the range view --------------------------------------------------------

test("the overview draws all 48 with no overlapping labels", () => {
    for (const [width, height] of [[990, 600], [343, 300]]) {
        const scene = buildScene({
            view: OVERVIEW,
            width,
            height,
            bagged: new Set(["washington", "lafayette"]),
            focus: null,
            selectedId: "lincoln",
        });
        assert.equal(scene.mounds.length, 48);
        assert.equal(new Set(scene.mounds.map((m) => m.id)).size, 48);
        // The selected peak always gets its label.
        assert.ok(scene.labels.some((l) => l.id === "lincoln" && l.selected));
        const boxes = [...scene.labels.map((l) => l.box)];
        for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= width && b.y1 <= height, "label inside the view");
            for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlapping(b, boxes[j]), "labels overlap");
        }
        for (const m of scene.mounds) {
            assert.ok(Number.isFinite(m.summit.x) && Number.isFinite(m.summit.y));
            assert.ok(!m.outline.includes("NaN") && !m.shade.includes("NaN"));
        }
    }
});

test("nearer mounds are drawn after farther ones", () => {
    const cam = makeCamera(OVERVIEW, 990, 600);
    const scene = buildScene({ view: OVERVIEW, width: 990, height: 600, bagged: new Set(), focus: null, selectedId: null });
    // Looking north, drawing order runs from north to south.
    const lats = scene.mounds.map((m) => PEAK_BY_ID.get(m.id)!.lat);
    for (let i = 1; i < lats.length; i++) assert.ok(lats[i - 1] >= lats[i]);
    // And the camera puts north up the screen.
    assert.ok(project(cam, 0, 10).y < project(cam, 0, -10).y);
});

test("focusing a range zooms in and dims the rest", () => {
    const view = focusView("franconia", OVERVIEW);
    assert.ok(view.radius < OVERVIEW.radius / 3);
    const scene = buildScene({ view, width: 990, height: 600, bagged: new Set(), focus: "franconia", selectedId: null });
    const franconia = scene.mounds.filter((m) => PEAK_BY_ID.get(m.id)!.range === "franconia");
    assert.equal(franconia.length, 4);
    assert.ok(franconia.every((m) => !m.dim));
    assert.ok(scene.mounds.filter((m) => !franconia.includes(m)).every((m) => m.dim));
    for (const m of franconia) assert.ok(scene.labels.some((l) => l.id === m.id), `${m.id} labeled`);
});

test("zooming keeps the point under the cursor in place", () => {
    const [w, h] = [900, 560];
    const at = { x: 610, y: 390 };
    const anchor = anchorUnder(OVERVIEW, w, h, at);
    assert.equal(anchor.z, 0);
    const before = makeCamera(OVERVIEW, w, h);
    const view = zoomView(OVERVIEW, w, h, 2, anchor, at);
    const cam = makeCamera(view, w, h);
    assert.ok(Math.abs(cam.scale / before.scale - 2) < 1e-9, "twice the pixels per km");
    const p = project(cam, anchor.e, anchor.n);
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < 1e-6);

    // A twist turns around the same point.
    const turned = zoomView(OVERVIEW, w, h, 1, anchor, at, 30);
    assert.equal(turned.azimuth, 30);
    const q = project(makeCamera(turned, w, h), anchor.e, anchor.n);
    assert.ok(Math.hypot(q.x - at.x, q.y - at.y) < 1e-6);
});

test("zooming in on a peak climbs toward it", () => {
    const [w, h] = [900, 560];
    const scene = buildScene({ view: OVERVIEW, width: w, height: h, bagged: new Set(), focus: null, selectedId: null });
    const summit = scene.mounds.find((m) => m.id === "washington")!.summit;
    const at = { x: summit.x, y: summit.y + 6 };
    const anchor = anchorUnder(OVERVIEW, w, h, at, "washington");
    assert.ok(anchor.z > 0, "the anchor is up on the mountain");
    const close = zoomView(OVERVIEW, w, h, 1000, anchor, at);
    assert.equal(close.radius, MIN_RADIUS);
    const p = project(makeCamera(close, w, h), anchor.e, anchor.n, anchor.z);
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < 1e-6);
    const zoomed = buildScene({ view: close, width: w, height: h, bagged: new Set(), focus: null, selectedId: null });
    assert.ok(zoomed.labels.some((l) => l.id === "washington"));
});

test("zoom stops at its limits and the view stays on the map", () => {
    const [w, h] = [900, 560];
    const out = zoomView(OVERVIEW, w, h, 0.001, { e: OVERVIEW.cx, n: OVERVIEW.cy, z: 0 }, { x: 450, y: 280 });
    assert.equal(out.radius, MAX_RADIUS);
    // The sky above the horizon maps to the far edge of the map, not to infinity.
    const sky = anchorUnder({ ...OVERVIEW, tilt: 8 }, w, h, { x: 450, y: 0 });
    assert.ok(Math.hypot(sky.e - OVERVIEW.cx, sky.n - OVERVIEW.cy) <= WORLD_REACH + 1e-9);
    const far = zoomView(OVERVIEW, w, h, 4, sky, { x: 0, y: h });
    assert.ok(Math.hypot(far.cx - OVERVIEW.cx, far.cy - OVERVIEW.cy) <= WORLD_REACH + 1e-9);
});

test("dragging keeps the grabbed point under the pointer", () => {
    const [w, h] = [900, 560];
    const from = { x: 300, y: 350 };
    const to = { x: 520, y: 240 };
    const anchor = anchorUnder(OVERVIEW, w, h, from);
    const moved = panView(OVERVIEW, w, h, anchor, to);
    assert.equal(moved.radius, OVERVIEW.radius);
    assert.equal(moved.azimuth, OVERVIEW.azimuth);
    const p = project(makeCamera(moved, w, h), anchor.e, anchor.n);
    assert.ok(Math.hypot(p.x - to.x, p.y - to.y) < 1e-6);
});

test("the flat map lines up with the peaks, and zooming out brings in the region", () => {
    const [w, h] = [900, 560];
    const view = { ...OVERVIEW, azimuth: 40, tilt: 55 };
    const scene = buildScene({ view, width: w, height: h, bagged: new Set(), focus: null, selectedId: null });
    const [a, b, c, d, tx, ty] = scene.groundTransform.slice(7, -1).split(" ").map(Number);
    const ground = toLocal(44.2705, -71.3033);
    const p = project(makeCamera(view, w, h), ground.e, ground.n);
    assert.ok(Math.abs(a * ground.e + c * ground.n + tx - p.x) < 0.01);
    assert.ok(Math.abs(b * ground.e + d * ground.n + ty - p.y) < 0.01);

    // Close in: notches, no cities (they're off screen), peak names.
    const close = buildScene({ view: OVERVIEW, width: w, height: h, bagged: new Set(), focus: null, selectedId: null });
    assert.ok(close.places.some((pl) => pl.kind === "notch"));
    assert.equal(close.region, null);
    assert.ok(close.labels.length > 0);

    // All the way out: the cities, one name for the range, and no peak names.
    const out = zoomView(OVERVIEW, w, h, 0.001, { e: OVERVIEW.cx, n: OVERVIEW.cy, z: 0 }, { x: w / 2, y: h / 2 });
    const wide = buildScene({ view: { ...out, tilt: 60 }, width: w, height: h, bagged: new Set(), focus: null, selectedId: null });
    const names = wide.places.map((pl) => pl.name);
    for (const city of ["Boston", "Portland", "Burlington", "Hanover"]) assert.ok(names.includes(city), city);
    assert.ok(wide.places.every((pl) => pl.kind === "city" || pl.kind === "town"));
    assert.equal(wide.labels.length, 0);
    assert.ok(wide.region);
    assert.equal(wide.mounds.length, 48);

    const map = getBasemap();
    for (const path of [map.water, map.borders, map.majorRoads, map.minorRoads]) {
        assert.match(path, /^M-?\d/);
        assert.doesNotMatch(path, /NaN/);
    }
});

test("label layout never overlaps and drops what cannot fit", () => {
    const bounds = { x0: 0, y0: 0, x1: 200, y1: 100 };
    const requests = Array.from({ length: 12 }, (_, i) => ({
        id: `p${i}`,
        ax: 100,
        ay: 60,
        lift: 4,
        width: 60,
        height: 20,
    }));
    const placed = layoutLabels(requests, [], bounds);
    assert.ok(placed.length > 1 && placed.length < 12);
    for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) assert.ok(!overlapping(placed[i].box, placed[j].box));
    }
    assert.equal(placed[0].leader, null); // the first one sits right on its anchor
});

test("profiles, heights and headings are well formed", () => {
    for (const p of PEAKS) {
        const shape = profileShape(p.id);
        assert.equal(shape.summit.y, 1);
        assert.ok(Math.max(...shape.outline.map((pt) => pt.y)) <= 1 + 1e-9, p.id);
        assert.ok(Math.min(...shape.outline.map((pt) => pt.y)) >= 0, p.id);
    }
    assert.equal(mapHeight(1000), 600);
    assert.equal(mapHeight(343), 300, "phones get a usable minimum");
    assert.equal(mapHeight(2000), 620, "wide screens are capped");
    assert.equal(facingName(0), "N");
    assert.equal(facingName(-90), "W");
    assert.equal(facingName(405), "NE");
    assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
});

test("CSV export has a row per peak and quotes awkward notes", () => {
    const csv = toCsv(statusByPeak(log(["washington", "2024-07-04", 'fog, wind "70 mph"'], ["tom", "2025-01-02", "=1+1"])));
    const lines = csv.split("\n");
    assert.equal(lines.length, 49);
    assert.equal(lines[0], "Peak,Elevation (ft),Range,First ascent,Ascents,All dates,Notes");
    assert.equal(lines[1], 'Washington,6288,Presidential Range,2024-07-04,1,2024-07-04,"fog, wind ""70 mph"""');
    assert.ok(lines.some((l) => l.startsWith("Tom,4051,Willey Range,2025-01-02,1,2025-01-02,'=1+1")));
    assert.ok(lines.some((l) => l === "Adams,5774,Presidential Range,,0,,"));
});

test("chart layouts: skyline, timeline ticks and month scale", () => {
    const sky = skylineLayout(990);
    assert.equal(sky.mountains.length, 48);
    assert.equal(sky.mountains[0].id, "washington");
    // Taller peaks reach higher (smaller y).
    assert.ok(sky.mountains[0].summit.y < sky.mountains[47].summit.y);
    assert.equal(skylineLayout(300).width, 640);

    assert.deepEqual(niceScale(3), { max: 4, step: 1 });
    assert.deepEqual(niceScale(7), { max: 8, step: 2 });
    assert.deepEqual(niceScale(13), { max: 15, step: 5 });
    assert.deepEqual(niceScale(48), { max: 50, step: 10 });
    const months = monthLayout([0, 1, 0, 0, 0, 2, 7, 5, 3, 1, 0, 0], 600);
    assert.equal(months.peak, 6);
    assert.deepEqual(months.gridlines.map((g) => g.value), [0, 2, 4, 6, 8]);
    assert.equal(months.bars[0].path, "");

    const ticks = timeTicks(dayNumber("2025-03-10"), dayNumber("2025-10-01"), 8);
    assert.equal(ticks[0].label, "Apr '25");
    assert.deepEqual(ticks.slice(1).map((t) => t.label), ["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    const years = timeTicks(dayNumber("2019-06-01"), dayNumber("2026-10-08"), 8);
    assert.deepEqual(years.map((t) => t.label), ["2020", "2021", "2022", "2023", "2024", "2025", "2026"]);

    assert.equal(timelineLayout([], "2026-10-08", 600), null);
    const status = statusByPeak(log(["washington", "2024-07-04"], ["monroe", "2024-07-04"], ["tom", "2025-02-01"]));
    const chart = timelineLayout(summarize(status).timeline, "2026-10-08", 600)!;
    assert.equal(chart.points.length, 2);
    assert.equal(chart.points[1].point.count, 3);
    assert.ok(chart.line.startsWith("M"));
});
