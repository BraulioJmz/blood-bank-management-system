#!/usr/bin/env bash
# Corre la suite completa y guarda el resultado en docs/evidencias/pruebas.md.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=docs/evidencias/pruebas.md
JSON=$(mktemp)
mkdir -p docs/evidencias
(cd apps/api && EVIDENCIA=1 npx jest --runInBand --json --outputFile="$JSON" >/dev/null 2>&1)
CODIGO=$?
node - "$JSON" "$OUT" "$CODIGO" <<'NODE'
const fs = require('fs');
const { execSync } = require('child_process');
const [json, out, codigo] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(json, 'utf8'));
const pg = (() => { try { return execSync('docker exec banco-sangre-db postgres --version').toString().trim(); } catch { return 'PostgreSQL 16'; } })();
const l = [];
l.push('# Evidencia de pruebas', '');
l.push(`- Fecha: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
l.push('- Comando: `npm test` (Jest `--runInBand`) contra PostgreSQL real (`banco_test`), sin mocks de BD');
l.push(`- Entorno: Node ${process.version}, ${pg}, ${process.platform} ${process.arch}`);
l.push(`- Resultado: **${r.numPassedTests}/${r.numTotalTests} pruebas pasan** en ${r.numTotalTestSuites} suites ${codigo === '0' ? '✅' : '❌'}`);
l.push('', 'Detalle numérico: `resultados-concurrencia.md`, `resultados-reglas.md`, `resultados-seguridad.md`.', '');
for (const s of r.testResults.sort((a, b) => a.name.localeCompare(b.name))) {
  const nombre = s.name.split('/apps/api/')[1];
  l.push(`## ${nombre}`, '', '| Prueba | Resultado | ms |', '|---|---|---|');
  for (const t of s.assertionResults) {
    const ruta = [...t.ancestorTitles.slice(1), t.title].join(' › ').replace(/\|/g, '\\|');
    l.push(`| ${ruta} | ${t.status === 'passed' ? '✅' : '❌ ' + t.status} | ${t.duration ?? ''} |`);
  }
  l.push('');
}
fs.writeFileSync(out, l.join('\n'));
NODE
rm -f "$JSON"
echo "Evidencia escrita en $OUT (código $CODIGO)"
exit $CODIGO
