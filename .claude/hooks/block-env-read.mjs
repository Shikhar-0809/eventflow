// PreToolUse(Bash|PowerShell) guard: block commands that reference .env files other than .env.example.
// Decisions are printed as Claude Code's documented deny JSON with exit 0, which behaves the same
// under bash, cmd and PowerShell (a non-zero exit other than 2 would be a non-blocking error).
// FAILS CLOSED: any problem reading or parsing the input denies the command.
import { readFileSync } from 'node:fs';

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `blocked: ${reason}`,
      },
    }),
  );
  process.exit(0);
};

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = input?.tool_input?.command;
  if (typeof command !== 'string') {
    deny('env guard could not read the command');
  }

  // ".env" or ".env.<suffix>" as a standalone path segment (not process.env, dotenv, etc.)
  const re = /(?:^|[\/\\\s"'=:(<>])(\.env(?:\.[\w.-]+)?)(?=$|[\/\\\s"';|&)<>])/g;
  for (const m of command.matchAll(re)) {
    if (m[1] !== '.env.example') {
      deny('reading .env files is not allowed');
    }
  }
  process.exit(0);
} catch {
  deny('env guard failed to run (fail closed)');
}
