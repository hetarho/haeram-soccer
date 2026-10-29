import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
const dir = 'packages/engine/src/grid/';
for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('test'))) {
  const sf = ts.createSourceFile(f, readFileSync(dir + f, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const name = d.name.getText();
      if (/_CONFIG$/.test(name)) {
        // reads of other configs inside a config initializer
      }
      const visit = (n: ts.Node, inFn: boolean) => {
        if (ts.isFunctionLike(n)) inFn = true;
        if (!inFn && ts.isPropertyAccessExpression(n) && /_CONFIG$/.test(n.expression.getText().split('.')[0]!))
          console.log(f, name, n.getText().slice(0, 80));
        ts.forEachChild(n, (c) => visit(c, inFn));
      };
      if (d.initializer) visit(d.initializer, false);
    }
  }
}
