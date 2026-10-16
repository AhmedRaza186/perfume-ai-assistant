import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

if (!process.stdin.isTTY) throw new Error('Run this in a local interactive terminal; do not pass a password on the command line.');
const silent = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const reader = createInterface({ input: process.stdin, output: silent, terminal: true });
process.stdout.write('Choose an admin password (12+ characters; input hidden): ');
reader.question('', password => {
  reader.close(); process.stdout.write('\n');
  if (password.length < 12 || password.length > 256) { process.stderr.write('Use 12 to 256 characters.\n'); process.exitCode = 1; return; }
  const salt = randomBytes(16).toString('hex');
  console.log(`ADMIN_PASSWORD_HASH=${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
});
