// PreToolUse(Bash) guard: block commands that reference .env files other than .env.example.
import { readFileSync } from 'node:fs';

let command = '';
try {
  command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '';
} catch {
  process.exit(0);
}

// ".env" or ".env.<suffix>" as a standalone path segment (not process.env, dotenv, etc.)
const re = /(?:^|[\/\\\s"'=:(<>])(\.env(?:\.[\w.-]+)?)(?=$|[\/\\\s"';|&)<>])/g;
for (const m of command.matchAll(re)) {
  if (m[1] !== '.env.example') {
    process.stderr.write('blocked: reading .env files is not allowed\n');
    process.exit(2);
  }
}
process.exit(0);
