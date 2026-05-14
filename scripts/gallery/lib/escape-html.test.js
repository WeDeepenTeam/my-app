import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { escapeHtml, escapeAttr } from './escape-html.js';

test('escapes the five HTML entities', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml(`"quoted" 'single'`), '&quot;quoted&quot; &#39;single&#39;');
});

test('handles null, undefined, and empty', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(''), '');
});

test('coerces non-strings safely', () => {
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(true), 'true');
});

test('does not double-escape', () => {
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
});

test('handles XSS attempt in album title', () => {
  const malicious = `<img src=x onerror="alert('xss')">`;
  const escaped = escapeHtml(malicious);
  // The opening `<` must be escaped so the tag never renders
  assert.ok(!escaped.includes('<img'));
  // Quotes around event handlers must be escaped
  assert.ok(!escaped.includes('"alert'));
  // Result is fully entity-encoded
  assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;');
});

test('handles attribute-context XSS', () => {
  // If an album title gets interpolated into an attribute, quotes must be escaped
  const malicious = `" onclick="alert(1)`;
  const escaped = escapeHtml(malicious);
  assert.ok(!escaped.includes('"'));
  assert.equal(escaped, '&quot; onclick=&quot;alert(1)');
});

test('escapeAttr is the same as escapeHtml', () => {
  assert.equal(escapeAttr(`a"b'c<d`), escapeHtml(`a"b'c<d`));
});
