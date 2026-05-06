import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");

const assets = [
  ["collection.css", "collection.min.css", "css"],
  ["collection-solver.js", "collection-solver.min.js", "js"],
  ["collection-app.js", "collection-app.min.js", "js"],
  ["collection-worker.js", "collection-worker.min.js", "js"],
];

function stripJsComments(source) {
  let output = "";
  let index = 0;
  let mode = "code";
  let quote = "";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (mode === "code") {
      if (char === "/" && next === "/") {
        while (index < source.length && source[index] !== "\n") index += 1;
        output += "\n";
        continue;
      }
      if (char === "/" && next === "*") {
        index += 2;
        while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
        index += 2;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        mode = char === "`" ? "template" : "string";
        quote = char;
      }
      output += char;
      index += 1;
      continue;
    }

    output += char;
    if (char === "\\") {
      output += source[index + 1] || "";
      index += 2;
      continue;
    }
    if ((mode === "string" && char === quote) || (mode === "template" && char === "`")) {
      mode = "code";
      quote = "";
    }
    index += 1;
  }

  return output;
}

function minifyJs(source) {
  return stripJsComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function minifyCss(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function minifyHtml(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

async function writeMinifiedAsset([inputName, outputName, type]) {
  const inputPath = path.join(root, inputName);
  const outputPath = path.join(distDir, outputName);
  const source = await fs.readFile(inputPath, "utf8");
  let minified = type === "css" ? minifyCss(source) : minifyJs(source);
  if (outputName === "collection-worker.min.js") {
    minified = minified.replace("collection-solver.js", "collection-solver.min.js");
  }
  if (outputName === "collection-app.min.js") {
    minified = minified.replace("collection-worker.js", "collection-worker.min.js");
  }
  await fs.writeFile(outputPath, `${minified}\n`, "utf8");
  return { inputName, outputName, before: source.length, after: minified.length };
}

async function writeDistIndex() {
  const source = await fs.readFile(path.join(root, "index.html"), "utf8");
  const dist = minifyHtml(
    source
      .replace("collection.css", "collection.min.css")
      .replace("collection-solver.js", "collection-solver.min.js")
      .replace("collection-app.js", "collection-app.min.js"),
  );
  await fs.writeFile(path.join(distDir, "index.html"), `${dist}\n`, "utf8");
}

await fs.mkdir(distDir, { recursive: true });
const results = [];
for (const asset of assets) results.push(await writeMinifiedAsset(asset));
await writeDistIndex();

for (const result of results) {
  const saved = result.before - result.after;
  const percent = result.before > 0 ? ((saved / result.before) * 100).toFixed(1) : "0.0";
  console.log(`${result.outputName}: ${result.before} -> ${result.after} bytes (${percent}% smaller)`);
}
