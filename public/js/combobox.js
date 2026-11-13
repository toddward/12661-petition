// Address combobox (WAI-ARIA 1.2 combobox with listbox popup), progressively enhancing the
// server-rendered <select data-combobox="/api/address-search">. Without JS the select works as is.
(function () {
  'use strict';

  function enhance(select) {
    var endpoint = select.getAttribute('data-combobox');
    var field = select.closest('.field') || select.parentNode;
    var label = field.querySelector('label[for="' + select.id + '"]');
    var hintId = select.id + '-hint';
    var errorId = select.id + '-error';

    var wrap = document.createElement('div');
    wrap.className = 'combobox';

    var input = document.createElement('input');
    input.type = 'text';
    input.id = select.id; // labels and error-summary links keep working
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('inputmode', 'search');
    var described = [hintId, document.getElementById(errorId) ? errorId : null, select.id + '-status'].filter(Boolean).join(' ');
    input.setAttribute('aria-describedby', described);
    if (select.getAttribute('aria-invalid')) input.setAttribute('aria-invalid', 'true');

    var listId = select.id + '-listbox';
    var list = document.createElement('ul');
    list.id = listId;
    list.className = 'combobox-list';
    list.setAttribute('role', 'listbox');
    if (label) list.setAttribute('aria-label', label.textContent.trim());
    list.hidden = true;
    input.setAttribute('aria-controls', listId);

    var hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = select.name;

    var status = document.createElement('p');
    status.id = select.id + '-status';
    status.className = 'combobox-status';
    status.setAttribute('role', 'status');

    // Keep the current selection (e.g. after a failed submit).
    var selected = select.options[select.selectedIndex];
    if (selected && selected.value) {
      hidden.value = selected.value;
      input.value = selected.textContent.trim();
    }

    select.id = select.id + '-select';
    select.removeAttribute('name');
    select.disabled = true;
    select.hidden = true;

    wrap.appendChild(input);
    wrap.appendChild(list);
    select.parentNode.insertBefore(wrap, select);
    wrap.parentNode.insertBefore(hidden, wrap);
    wrap.parentNode.insertBefore(status, wrap.nextSibling);

    var results = [];
    var active = -1;
    var timer = null;
    var seq = 0;
    var chosenLabel = input.value;

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function render() {
      list.textContent = '';
      if (!results.length) {
        var li = document.createElement('li');
        li.className = 'combobox-empty';
        li.textContent = 'No matching address. Check the house number, or contact the organizer.';
        li.setAttribute('aria-disabled', 'true');
        list.appendChild(li);
      }
      results.forEach(function (r, i) {
        var li = document.createElement('li');
        li.id = listId + '-opt-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', i === active ? 'true' : 'false');
        li.textContent = r.label;
        li.addEventListener('mousedown', function (e) { e.preventDefault(); });
        li.addEventListener('click', function () { choose(i); });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', listId + '-opt-' + active);
      else input.removeAttribute('aria-activedescendant');
    }

    function choose(i) {
      var r = results[i];
      if (!r) return;
      hidden.value = r.id;
      input.value = r.label;
      chosenLabel = r.label;
      status.textContent = 'Selected: ' + r.label;
      close();
    }

    function search(q) {
      var mine = ++seq;
      fetch(endpoint + '?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (res.status === 429) throw new Error('rate');
          if (!res.ok) throw new Error('http');
          return res.json();
        })
        .then(function (data) {
          if (mine !== seq) return;
          results = Array.isArray(data) ? data : [];
          active = results.length ? 0 : -1;
          render();
          status.textContent = results.length
            ? results.length + (results.length === 1 ? ' address found.' : ' addresses found. Use the arrow keys to choose.')
            : 'No matching address.';
        })
        .catch(function (err) {
          if (mine !== seq) return;
          status.textContent = err.message === 'rate'
            ? 'Too many searches. Please wait a minute and try again.'
            : 'Search is not working right now. Please try again.';
        });
    }

    input.addEventListener('input', function () {
      if (input.value !== chosenLabel) hidden.value = '';
      var q = input.value.trim();
      window.clearTimeout(timer);
      if (q.length < 2) {
        results = [];
        close();
        status.textContent = '';
        return;
      }
      timer = window.setTimeout(function () { search(q); }, 160);
    });

    input.addEventListener('keydown', function (e) {
      var open = !list.hidden;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open && results.length) { active = 0; render(); return; }
        if (results.length) { active = (active + 1) % results.length; render(); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (results.length) { active = active <= 0 ? results.length - 1 : active - 1; render(); }
      } else if (e.key === 'Enter') {
        if (open && active >= 0) { e.preventDefault(); choose(active); }
      } else if (e.key === 'Escape') {
        if (open) { e.preventDefault(); close(); }
        else { input.value = ''; hidden.value = ''; chosenLabel = ''; }
      } else if (e.key === 'Tab') {
        if (open && active >= 0 && !hidden.value) choose(active);
        close();
      }
    });

    input.addEventListener('blur', function () { window.setTimeout(close, 120); });
  }

  function init() {
    var selects = document.querySelectorAll('select[data-combobox]');
    for (var i = 0; i < selects.length; i++) enhance(selects[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
