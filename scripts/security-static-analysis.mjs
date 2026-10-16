import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const risk = {
  dynamicCode: "dynamic-code-execution",
  htmlInjection: "unsafe-dom-html-write",
};
export function inspectSource(path, content) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  function warn(node, rule) {
    const lc = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({path, line:lc.line+1, column:lc.character+1, rule});
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        (node.expression.text === "eval" || node.expression.text === "Function"))
      warn(node, risk.dynamicCode);
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "Function")
      warn(node, risk.dynamicCode);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ["write", "writeln"].includes(node.expression.name.text) &&
        ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "document")
      warn(node, risk.htmlInjection);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        ["innerHTML", "outerHTML"].includes(node.left.name.text))
      warn(node, risk.htmlInjection);
    if ((ts.isJsxAttribute(node) || ts.isPropertyAssignment(node)) &&
        node.name && ts.isIdentifier(node.name) &&
        node.name.text === "dangerouslySetInnerHTML")
      warn(node, risk.htmlInjection);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}
function trackedSourceFiles() {
  return execFileSync("git", ["ls-files", "-z"], {maxBuffer: 8*1024*1024})
    .toString("utf8").split("\0").filter(path =>
      /^(apps\/(?:api|web)\/src|packages\/[^/]+\/src)\/.+\.tsx?$/.test(path));
}
export function run() {
  const found = trackedSourceFiles().flatMap(path => inspectSource(path, readFileSync(path, "utf8")));
  if (found.length) {
    for (const item of found) console.error(item.path + ":" + item.line + ":" + item.column + " " + item.rule);
    process.exitCode = 1;
  } else console.log("Source AST security guard (dynamic code and direct HTML injection): PASS");
}
if (process.argv[1]?.endsWith("security-static-analysis.mjs")) run();
