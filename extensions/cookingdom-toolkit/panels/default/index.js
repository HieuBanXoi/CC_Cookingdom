'use strict';

const fs = require('fs');
const path = require('path');
const template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const style = fs.readFileSync(path.join(__dirname, 'index.css'), 'utf8');

module.exports = Editor.Panel.define({
  template,
  style,
  $: { scan: '#scan', status: '#status', checks: '#checks', scenes: '#scenes', guidance: '#guidance' },
  ready() {
    this.$.scan.addEventListener('confirm', () => void scan.call(this));
    void scan.call(this);
  },
});

async function scan() {
  this.$.status.textContent = 'Scanning project...';
  try {
    const report = await Editor.Message.request('cookingdom-toolkit', 'scan-base');
    this.$.checks.innerHTML = report.checks.map((check) => `<li class="${check.exists ? 'ok' : 'missing'}">${check.exists ? 'OK' : 'Missing'} — ${escapeHtml(check.relativePath)}</li>`).join('');
    this.$.scenes.innerHTML = report.scenes.length ? report.scenes.map((scene) => `<li>${escapeHtml(scene)}</li>`).join('') : '<li>No scenes found.</li>';
    this.$.guidance.innerHTML = report.guidance.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    this.$.status.textContent = `Ready: ${report.projectName}`;
  } catch (error) {
    this.$.status.textContent = error.message || String(error);
  }
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
