// Reinicia banco_test UNA vez antes de toda la corrida (drop + migraciones + seeds).
// Las pruebas corren contra PostgreSQL real, sin mocks de BD.
const { execSync } = require('node:child_process');
const path = require('node:path');

module.exports = async () => {
  execSync('npm run db:reset -- --db banco_test', {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    stdio: 'ignore',
  });
};
