import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.join(import.meta.dirname, "..", "scripts", "make-virtual-oauth.mjs");

function mktmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "csswitch-oauth-"));
}
function run(authDir, extra = []) {
  return execFileSync("node", [SCRIPT, "--auth-dir", authDir, ...extra],
    { stdio: "pipe" });
}

test("auth-dir symlink whose realpath is outside .sandbox is rejected", () => {
  const t = mktmp();
  const outside = path.join(t, "outside");
  fs.mkdirSync(outside, { recursive: true });
  const sbParent = path.join(t, ".sandbox");
  fs.mkdirSync(sbParent, { recursive: true });
  const link = path.join(sbParent, "auth");
  fs.symlinkSync(outside, link); // .sandbox/auth -> outside
  assert.throws(() => run(link));
  assert.deepEqual(fs.readdirSync(outside), []); // target untouched
});

test("leaf encryption.key symlink is refused, target untouched", () => {
  const t = mktmp();
  const auth = path.join(t, ".sandbox", "auth");
  fs.mkdirSync(auth, { recursive: true });
  const secret = path.join(t, "secret-target");
  fs.writeFileSync(secret, "ORIGINAL");
  fs.symlinkSync(secret, path.join(auth, "encryption.key"));
  assert.throws(() => run(auth));
  assert.equal(fs.readFileSync(secret, "utf-8"), "ORIGINAL");
});

test("normal sandbox dir writes regular 0600 files", () => {
  const t = mktmp();
  const auth = path.join(t, ".sandbox", "auth");
  fs.mkdirSync(auth, { recursive: true });
  run(auth);
  for (const f of ["encryption.key", "active-org.json"]) {
    const st = fs.lstatSync(path.join(auth, f));
    assert.ok(!st.isSymbolicLink());
    assert.equal(st.mode & 0o777, 0o600);
  }
  const enc = fs.readdirSync(path.join(auth, ".oauth-tokens")).filter((x) => x.endsWith(".enc"));
  assert.equal(enc.length, 1);
});
