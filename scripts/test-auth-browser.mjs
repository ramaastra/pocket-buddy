import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const webOrigin = 'http://localhost:3000';
const apiOrigin = 'http://localhost:8080';
const mailpitAPI = 'http://127.0.0.1:8025/api/v1';
const email = process.env.TEST_EMAIL;
if (!email || !email.endsWith('@example.test')) {
  throw new Error('TEST_EMAIL must be a synthetic @example.test address');
}

const firstPassword = 'Local-Browser-Auth-Password-2026';
const resetPassword = 'Local-Browser-Auth-Password-Changed-2026';
const initialMessageIDs = new Set();
let chrome;
let profileDirectory;
let cdp;
let stage = 'service availability';

function pass(message) {
  console.log(`PASS ${message}`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  pass(message);
}

async function waitUntil(description, readValue, predicate = Boolean, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await readValue();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function checkService(url, expectedStatus = 200) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (response.status !== expectedStatus) throw new Error(`service check returned HTTP ${response.status}`);
  return response;
}

async function listMailpitMessages() {
  const response = await checkService(`${mailpitAPI}/messages?start=0&limit=200`);
  return (await response.json()).messages || [];
}

function mailToTestAddress(message) {
  return (message.To || []).some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase());
}

async function waitForMail(subjectPart) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const messages = await listMailpitMessages();
    const message = messages.find((candidate) =>
      !initialMessageIDs.has(candidate.ID)
      && mailToTestAddress(candidate)
      && String(candidate.Subject || '').toLowerCase().includes(subjectPart.toLowerCase()));
    if (message) {
      const fullResponse = await checkService(`${mailpitAPI}/message/${encodeURIComponent(message.ID)}`);
      const full = await fullResponse.json();
      const content = `${full.Text || ''}\n${full.HTML || ''}`;
      const link = content.match(/https?:\/\/[^\s"'<>]*#token=[A-Za-z0-9_-]+/)?.[0];
      if (!link) throw new Error(`Mailpit ${subjectPart} email did not contain a link`);
      const parsed = new URL(link);
      if (parsed.origin !== webOrigin || parsed.pathname !== (subjectPart === 'verify' ? '/verify-email' : '/reset-password')) {
        throw new Error(`Mailpit ${subjectPart} link points to an unexpected local route`);
      }
      return { id: message.ID, link };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for Mailpit ${subjectPart} email`);
}

async function cleanupMailpitMessages() {
  const messages = await listMailpitMessages();
  const ids = messages
    .filter((message) => !initialMessageIDs.has(message.ID) && mailToTestAddress(message))
    .map((message) => message.ID);
  if (!ids.length) return;
  const response = await fetch(`${mailpitAPI}/messages`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ IDs: ids }),
  });
  if (!response.ok) throw new Error(`Mailpit cleanup returned HTTP ${response.status}`);
}

function cdpClient(socketURL) {
  const socket = new WebSocket(socketURL);
  const pending = new Map();
  let nextID = 0;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Chrome DevTools connection failed')), { once: true });
  });
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(`Chrome DevTools command ${request.method} failed`));
    else request.resolve(message.result);
  });
  return {
    async send(method, params = {}) {
      await ready;
      const id = ++nextID;
      return new Promise((resolve, reject) => {
        pending.set(id, { method, resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function startChrome() {
  const portServer = createServer();
  await new Promise((resolve, reject) => {
    portServer.once('error', reject);
    portServer.listen(0, '127.0.0.1', resolve);
  });
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));

  profileDirectory = await mkdtemp(join(tmpdir(), 'pocket-buddy-auth-chrome-'));
  const binary = process.env.CHROME_BIN || 'google-chrome';
  chrome = spawn(binary, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
    'about:blank',
  ], { stdio: 'ignore' });
  let chromeSpawnFailed = false;
  chrome.on('error', () => { chromeSpawnFailed = true; });

  const versionURL = `http://127.0.0.1:${port}/json/version`;
  const version = await waitUntil('Chrome DevTools endpoint', async () => {
    if (chromeSpawnFailed) throw new Error('could not start Chrome; set CHROME_BIN to its executable');
    if (chrome.exitCode !== null) throw new Error('Chrome exited before starting');
    try {
      const response = await fetch(versionURL, { signal: AbortSignal.timeout(500) });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  });
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error('could not create a Chrome tab');
  const target = await targetResponse.json();
  cdp = cdpClient(target.webSocketDebuggerUrl || version.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
}

async function stopChromeProcess(signal, timeoutMs) {
  if (!chrome || chrome.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    chrome.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    chrome.kill(signal);
  });
}

async function stopChrome() {
  if (cdp) {
    cdp.close();
    cdp = null;
  }
  await stopChromeProcess('SIGTERM', 5000);
  await stopChromeProcess('SIGKILL', 5000);
  if (profileDirectory) {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    profileDirectory = null;
  }
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw new Error('browser page script failed');
  return result.result?.value;
}

async function waitForPage(description, expression, timeoutMs = 15000) {
  return waitUntil(description, () => evaluate(expression), Boolean, timeoutMs);
}

async function navigate(url, path) {
  await cdp.send('Page.navigate', { url });
  await waitForPage(`page ${path}`, `document.readyState === 'complete' && location.pathname === ${JSON.stringify(path)}`);
}

async function fillInput(selector, value) {
  const expression = `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === ${JSON.stringify(value)};
  })()`;
  if (!await waitForPage(`input ${selector}`, expression, 10000)) throw new Error(`could not fill ${selector}`);
}

async function clickButton(label) {
  const expression = `(() => {
    const button = [...document.querySelectorAll('button')].find((item) => (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`;
  if (!await waitForPage(`button ${label}`, expression, 10000)) throw new Error(`button unavailable: ${label}`);
}

async function clickLink(href) {
  const expression = `(() => {
    const link = [...document.querySelectorAll('a')].find((item) => item.getAttribute('href') === ${JSON.stringify(href)});
    if (!link) return false;
    link.click();
    return true;
  })()`;
  if (!await waitForPage(`link ${href}`, expression, 10000)) throw new Error(`link unavailable: ${href}`);
  await waitForPage(`route ${href}`, `location.pathname === ${JSON.stringify(href)}`);
}

async function submitSignIn(password) {
  await fillInput('input[autocomplete="email"]', email);
  await fillInput('input[autocomplete="current-password"]', password);
  await clickButton('Sign in');
  await waitForPage('signed-in overview', `location.pathname === '/' && document.body.innerText.includes('Overview')`, 20000);
  const status = await evaluate(`fetch(${JSON.stringify(`${apiOrigin}/api/auth/me`)}, { credentials: 'include' }).then((response) => response.status)`);
  check(status === 200, 'signed-in session is active in the browser');
}

try {
  await checkService(`${webOrigin}/sign-up`);
  await checkService(`${apiOrigin}/api/health`);
  const messages = await listMailpitMessages();
  for (const message of messages) initialMessageIDs.add(message.ID);
  await startChrome();

  stage = 'registration form';
  await navigate(`${webOrigin}/sign-up`, '/sign-up');
  await fillInput('input[autocomplete="name"]', 'Browser Auth Check');
  await fillInput('input[autocomplete="email"]', email);
  await clickButton('Send verification link');
  await waitForPage('registration inbox confirmation', `document.body.innerText.includes('Check your inbox')`);
  pass('registration form submitted');

  stage = 'verification email';
  const verification = await waitForMail('verify');
  pass('verification email captured by Mailpit');
  stage = 'verification form';
  await navigate(verification.link, '/verify-email');
  await waitForPage('verification password form', `!!document.querySelector('input[autocomplete="new-password"]')`);
  await fillInput('input[autocomplete="new-password"]', firstPassword);
  await clickButton('Verify and create account');
  await waitForPage('email verified confirmation', `document.body.innerText.includes('Email verified')`);
  pass('verification email link completed in browser');
  await clickLink('/sign-in');

  stage = 'password reset request';
  await clickLink('/forgot-password');
  await fillInput('input[autocomplete="email"]', email);
  await clickButton('Send reset link');
  await waitForPage('reset inbox confirmation', `document.body.innerText.includes('Check your inbox')`);
  pass('password-reset request submitted');

  stage = 'password-reset email';
  const reset = await waitForMail('reset');
  pass('password-reset email captured by Mailpit');
  stage = 'password-reset form';
  await navigate(reset.link, '/reset-password');
  await waitForPage('new password form', `!!document.querySelector('input[autocomplete="new-password"]')`);
  await fillInput('input[autocomplete="new-password"]', resetPassword);
  await clickButton('Save new password');
  await waitForPage('password changed confirmation', `document.body.innerText.includes('Password changed')`);
  pass('password-reset email link completed in browser');

  stage = 'sign-in after password reset';
  await clickLink('/sign-in');
  await submitSignIn(resetPassword);
  pass('updated password signed in through the browser form');

  stage = 'final sign-out';
  await clickLink('/settings/account');
  await waitForPage('account security page', `document.body.innerText.includes('Account security')`);
  await clickButton('Sign out');
  await waitForPage('final signed-out state', `location.pathname === '/sign-in' && document.body.innerText.includes('Sign in')`);
  pass('final sign-out completed');
} catch (error) {
  console.error(`FAIL ${stage}: ${error.message}`);
  process.exitCode = 1;
} finally {
  try {
    await stopChrome();
  } catch {
    console.error('CLEANUP WARNING: could not remove the temporary Chrome profile');
    process.exitCode = 1;
  }
  try {
    await cleanupMailpitMessages();
    pass('temporary auth emails removed from Mailpit');
  } catch {
    console.error('CLEANUP WARNING: could not remove test emails from Mailpit');
    process.exitCode = 1;
  }
}
