// Generates the fitter-derived README blocks and patches them between markers:
//   <!-- fitter:pipeline --> mermaid flowchart derived from fitter/profile.json
//   <!-- fitter:map -->      geojson map of every connector host in fitter/profile.json
// Usage: node scripts/render_blocks.mjs   (structural only — reads fitter/profile.json)
import { readFile, writeFile } from "node:fs/promises";

const config = JSON.parse(await readFile("fitter/profile.json", "utf8"));

/* ---- walk the config: field name -> connector url ---- */
const rootUrl = config.item.connector_config.url;
const fields = config.item.model.object_config.fields;
const sources = [];
for (const [name, f] of Object.entries(fields)) {
  const cc = f.base_field?.generated?.model?.connector_config;
  sources.push({ name, url: cc ? cc.url : rootUrl, nested: !!cc });
}
const host = u => new URL(u.replace(/\{\{\{[^}]*\}\}\}/g, "x").replace(/\{PL\}/g, "x")).host;

/* ---- 1. pipeline flowchart (from the config, not by hand) ---- */
const label = { me: "my profile stats", caught_doing: "latest public event", fitter: "star count + verdict", btc: "price + HODL advice", hn_top_story: "HN front page", dad_joke: "humor delivery" };
let mermaid = "flowchart LR\n";
mermaid += '    cfg["fitter/profile.json<br>(one declarative config)"] --> engine{{"fitter engine"}}\n';
for (const s of sources) {
  mermaid += `    engine -->|"GET ${host(s.url)}"| ${s.name}["${s.name}<br><i>${label[s.name] ?? ""}</i>"]\n`;
}
mermaid += `    ${sources.map(s => s.name).join(" & ")} --> out[("one clean JSON")]\n`;

/* ---- 3. geojson map of connector hosts ---- */
const GEO = {
  "api.github.com": { c: [-122.419, 37.775], where: "San Francisco" },
  "api.coingecko.com": { c: [103.85, 1.29], where: "Singapore" },
  "hacker-news.firebaseio.com": { c: [-122.084, 37.422], where: "Mountain View" },
  "hn.algolia.com": { c: [2.349, 48.853], where: "Paris" },
  "official-joke-api.appspot.com": { c: [-122.084, 37.422], where: "Mountain View" },
  "v2.jokeapi.dev": { c: [9.993, 53.551], where: "Hamburg" }
};
const BERLIN = [13.405, 52.52];
const feats = [{ type: "Feature", properties: { name: "fitter runs here (or in YOUR browser)", role: "Berlin" }, geometry: { type: "Point", coordinates: BERLIN } }];
const seen = new Set();
for (const s of sources) {
  const h = host(s.url), g = GEO[h];
  if (!g || seen.has(h)) continue;
  seen.add(h);
  feats.push({ type: "Feature", properties: { name: h, role: `connector for "${s.name}" (${g.where})` }, geometry: { type: "Point", coordinates: g.c } });
}
feats.push({ type: "Feature", properties: { name: "connector requests" }, geometry: { type: "MultiLineString", coordinates: [...seen].map(h => [BERLIN, GEO[h].c]) } });
const geojson = JSON.stringify({ type: "FeatureCollection", features: feats }, null, 2);

/* ---- patch README ---- */
const blocks = {
  pipeline: "```mermaid\n" + mermaid + "```",
  map: "```geojson\n" + geojson + "\n```"
};
let readme = await readFile("README.md", "utf8");
for (const [key, content] of Object.entries(blocks)) {
  const START = `<!-- fitter:${key}:start -->`, END = `<!-- fitter:${key}:end -->`;
  const s = readme.indexOf(START), e = readme.indexOf(END);
  if (s === -1 || e === -1) throw new Error(`markers for ${key} not found`);
  readme = readme.slice(0, s) + START + "\n" + content + "\n" + END + readme.slice(e + END.length);
}
await writeFile("README.md", readme);
console.log(`patched pipeline (${sources.length} sources), map (${seen.size} hosts)`);
