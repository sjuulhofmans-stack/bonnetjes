// PDF-uitdraaien maken (met jsPDF + jspdf-autotable, staan in /vendor).

const PDF = (() => {
  const PAGE_W = 210, PAGE_H = 297, M = 16;            // A4 in millimeters, marge
  const CONTENT_W = PAGE_W - 2 * M;
  const BOTTOM = PAGE_H - 18;
  const TEAL = [15, 118, 110], TEAL_LIGHT = [204, 235, 230], INK = [31, 41, 55], MUTED = [107, 114, 128];

  function newDoc() {
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    return doc;
  }

  function header(doc, title, subtitle, employeeName) {
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, PAGE_W, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold').setFontSize(18);
    doc.text(title, M, 14);
    doc.setFont('helvetica', 'normal').setFontSize(11);
    doc.text(subtitle, M, 22, { maxWidth: 120 });
    doc.setFontSize(9);
    doc.text(`Opgemaakt op ${fmtDate(todayISO())}`, PAGE_W - M, 14, { align: 'right' });
    if (employeeName) doc.text(`Medewerker: ${employeeName}`, PAGE_W - M, 20, { align: 'right' });
    doc.setTextColor(...INK);
    return 42;
  }

  function ensureSpace(doc, y, needed) {
    if (y + needed <= BOTTOM) return y;
    doc.addPage();
    return 20;
  }

  function sectionTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
    doc.text(text, M, y);
    doc.setFont('helvetica', 'normal');
    return y + 5;
  }

  function statBox(doc, x, y, w, h, label, value, big = false) {
    doc.setFillColor(...(big ? TEAL_LIGHT : [243, 244, 246]));
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
    doc.setFontSize(big ? 10 : 8).setTextColor(...MUTED);
    doc.text(label, x + 5, y + (big ? 8 : 6.5));
    doc.setFont('helvetica', 'bold').setFontSize(big ? 26 : 13).setTextColor(...(big ? TEAL : INK));
    doc.text(value, x + 5, y + (big ? 21 : 14.5));
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
  }

  // Liggende staafjes: per cliënt of per maand.
  function bars(doc, y, title, rows) {
    const rowH = 7, labelW = 48, valueW = 26;
    const barW = CONTENT_W - labelW - valueW - 4;
    const max = Math.max(...rows.map(r => r.cents), 1);
    y = ensureSpace(doc, y, 14 + rowH * Math.min(rows.length, 3));
    y = sectionTitle(doc, title, y) + 2;
    for (const r of rows) {
      y = ensureSpace(doc, y, rowH);
      doc.setFontSize(9).setTextColor(...INK);
      doc.text(doc.splitTextToSize(r.label, labelW - 2)[0], M, y + 4.3);
      doc.setFillColor(...TEAL);
      doc.roundedRect(M + labelW, y + 0.8, Math.max(barW * r.cents / max, 0.8), rowH - 2.6, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text(fmtEUR(r.cents), PAGE_W - M, y + 4.3, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += rowH;
    }
    return y + 6;
  }

  function table(doc, y, opts) {
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M, top: 20, bottom: 22 },
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: INK, overflow: 'linebreak' },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: TEAL_LIGHT, textColor: INK, fontStyle: 'bold' },
      showFoot: 'lastPage',
      ...opts,
    });
    return doc.lastAutoTable.finalY + 9;
  }

  function signatures(doc, y) {
    y = ensureSpace(doc, y, 34);
    const w = (CONTENT_W - 12) / 2;
    doc.setFontSize(9).setTextColor(...MUTED);
    [['Handtekening medewerker', M], ['Akkoord leidinggevende', M + w + 12]].forEach(([label, x]) => {
      doc.text(label, x, y);
      doc.setDrawColor(180);
      doc.line(x, y + 16, x + w, y + 16);
      doc.text('Naam en datum:', x, y + 22);
    });
    doc.setTextColor(...INK);
    return y + 30;
  }

  function footer(doc, label) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(8).setTextColor(...MUTED);
      doc.text(label, M, PAGE_H - 8);
      doc.text(`Pagina ${i} van ${n}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
    }
    doc.setTextColor(...INK);
  }

  async function drawPhoto(doc, path, x, y, maxW, maxH) {
    try {
      const dataUrl = await Api.photoDataUrl(path);
      const img = await loadImage(dataUrl);
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      const fmt = /^data:image\/png/.test(dataUrl) ? 'PNG' : 'JPEG';
      doc.addImage(dataUrl, fmt, x + (maxW - w) / 2, y, w, h, undefined, 'FAST');
      doc.setDrawColor(220);
      doc.rect(x + (maxW - w) / 2, y, w, h);
    } catch (e) {
      doc.setFontSize(10).setTextColor(190, 18, 60);
      doc.text(`Foto kon niet worden geladen: ${e.message}`, x, y + 6, { maxWidth: maxW });
      doc.setTextColor(...INK);
    }
  }

  // Kolomstijlen gelden niet voor de totaalregel, dus daar apart rechts uitlijnen.
  function right(content) { return { content, styles: { halign: 'right' } }; }

  function clientLabel(c) { return c ? c.name : '(onbekende cliënt)'; }

  // ---------------------------------------------------------------
  //  Overzicht: hele maand / periode, alle cliënten of één cliënt
  // ---------------------------------------------------------------
  async function report({ receipts, clientsById, from, to, client, employeeName, includePhotos, onProgress }) {
    const doc = newDoc();
    const items = [...receipts]
      .sort((a, b) => a.receipt_date.localeCompare(b.receipt_date) || String(a.created_at).localeCompare(String(b.created_at)))
      .map((r, i) => ({ ...r, nr: i + 1, client: clientsById.get(r.client_id) }));
    const total = sumCents(items);
    const period = periodLabel(from, to);
    const scope = client ? client.name : 'alle cliënten';
    const title = client ? 'Overzicht bonnetjes cliënt' : 'Declaratie voorgeschoten kosten';

    let y = header(doc, title, `${period} · ${scope}`, employeeName);

    if (client) {
      const lines = [['Cliënt', client.name]];
      if (client.client_number) lines.push(['Cliëntnummer', client.client_number]);
      if (client.has_guardian) {
        lines.push(['Bewindvoerder', [client.guardian_name, client.guardian_contact].filter(Boolean).join(' · ') || 'ja']);
      }
      doc.setFontSize(10);
      for (const [k, v] of lines) {
        doc.setTextColor(...MUTED).text(k, M, y);
        doc.setTextColor(...INK).text(String(v), M + 32, y, { maxWidth: CONTENT_W - 32 });
        y += 5.5;
      }
      y += 3;
    }

    statBox(doc, M, y, CONTENT_W, 27, client ? 'Totaal voorgeschoten voor deze cliënt' : 'Terug te ontvangen', fmtEUR(total), true);
    y += 32;

    const perClient = new Map();
    for (const r of items) {
      const key = r.client_id;
      const e = perClient.get(key) || { label: clientLabel(r.client), cents: 0, count: 0 };
      e.cents += toCents(r.amount);
      e.count += 1;
      perClient.set(key, e);
    }
    const perMonth = new Map();
    for (const r of items) {
      const ym = r.receipt_date.slice(0, 7);
      const e = perMonth.get(ym) || { label: monthLabel(ym), cents: 0, count: 0 };
      e.cents += toCents(r.amount);
      e.count += 1;
      perMonth.set(ym, e);
    }

    const highest = items.reduce((m, r) => Math.max(m, toCents(r.amount)), 0);
    const boxW = (CONTENT_W - 3 * 4) / 4;
    const stats = [
      ['Aantal bonnetjes', String(items.length)],
      client ? ['Aantal maanden', String(perMonth.size)] : ['Aantal cliënten', String(perClient.size)],
      ['Gemiddeld per bonnetje', items.length ? fmtEUR(Math.round(total / items.length)) : fmtEUR(0)],
      ['Hoogste bedrag', fmtEUR(highest)],
    ];
    stats.forEach(([label, value], i) => statBox(doc, M + i * (boxW + 4), y, boxW, 20, label, value));
    y += 28;

    if (!items.length) {
      doc.setFontSize(11).setTextColor(...MUTED);
      doc.text('Er zijn geen bonnetjes in deze periode.', M, y + 4);
      doc.setTextColor(...INK);
      footer(doc, `${title} · ${period}`);
      return doc;
    }

    if (!client && perClient.size > 1) {
      const rows = [...perClient.values()].sort((a, b) => b.cents - a.cents);
      y = bars(doc, y, 'Verdeling per cliënt', rows);
    } else if (perMonth.size > 1) {
      y = bars(doc, y, 'Verdeling per maand', [...perMonth.entries()].sort().map(([, v]) => v));
    }

    if (!client) {
      const rows = [...perClient.values()].sort((a, b) => a.label.localeCompare(b.label, 'nl'));
      y = ensureSpace(doc, y, 30);
      y = sectionTitle(doc, 'Totaal per cliënt', y);
      y = table(doc, y, {
        head: [['Cliënt', { content: 'Aantal', styles: { halign: 'center' } }, right('Bedrag')]],
        body: rows.map(r => [r.label, String(r.count), fmtEUR(r.cents)]),
        foot: [['Totaal', { content: String(items.length), styles: { halign: 'center' } }, right(fmtEUR(total))]],
        columnStyles: { 1: { halign: 'center', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 32 } },
      });
    }

    y = ensureSpace(doc, y, 30);
    y = sectionTitle(doc, 'Alle bonnetjes', y);
    const head = client
      ? [['Nr', 'Datum', 'Omschrijving', 'Foto', right('Bedrag')]]
      : [['Nr', 'Datum', 'Cliënt', 'Omschrijving', 'Foto', right('Bedrag')]];
    y = table(doc, y, {
      head,
      body: items.map(r => {
        const row = [String(r.nr), fmtDate(r.receipt_date)];
        if (!client) row.push(clientLabel(r.client));
        row.push(r.description, r.photo_path ? 'ja' : '–', fmtEUR(toCents(r.amount)));
        return row;
      }),
      foot: [client ? ['', '', 'Totaal', '', right(fmtEUR(total))] : ['', '', '', 'Totaal', '', right(fmtEUR(total))]],
      columnStyles: client
        ? { 0: { cellWidth: 10 }, 1: { cellWidth: 22 }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 26, halign: 'right' } }
        : { 0: { cellWidth: 10 }, 1: { cellWidth: 22 }, 2: { cellWidth: 36 }, 4: { cellWidth: 12, halign: 'center' }, 5: { cellWidth: 26, halign: 'right' } },
    });

    signatures(doc, y);

    if (includePhotos) {
      const withPhoto = items.filter(r => r.photo_path);
      for (let i = 0; i < withPhoto.length; i++) {
        const r = withPhoto[i];
        onProgress?.(`Foto ${i + 1} van ${withPhoto.length} toevoegen…`);
        doc.addPage();
        doc.setFont('helvetica', 'bold').setFontSize(13);
        doc.text(`Bijlage — bonnetje nr. ${r.nr}`, M, 18);
        doc.setFont('helvetica', 'normal').setFontSize(10);
        doc.text(`${fmtDate(r.receipt_date)} · ${clientLabel(r.client)} · ${fmtEUR(toCents(r.amount))}`, M, 25);
        doc.setTextColor(...MUTED);
        doc.text(doc.splitTextToSize(r.description, CONTENT_W)[0], M, 31);
        doc.setTextColor(...INK);
        await drawPhoto(doc, r.photo_path, M, 37, CONTENT_W, BOTTOM - 37);
      }
    }

    footer(doc, `${title} · ${period} · ${scope}`);
    return doc;
  }

  // ---------------------------------------------------------------
  //  Eén bonnetje
  // ---------------------------------------------------------------
  async function single({ receipt, client, employeeName }) {
    const doc = newDoc();
    let y = header(doc, 'Bonnetje', clientLabel(client), employeeName);
    const rows = [
      ['Datum', fmtDate(receipt.receipt_date)],
      ['Cliënt', clientLabel(client)],
    ];
    if (client?.client_number) rows.push(['Cliëntnummer', client.client_number]);
    if (client?.has_guardian) rows.push(['Bewindvoerder', [client.guardian_name, client.guardian_contact].filter(Boolean).join(' · ') || 'ja']);
    rows.push(['Omschrijving', receipt.description], ['Bedrag', fmtEUR(toCents(receipt.amount))]);
    y = table(doc, y, {
      body: rows,
      theme: 'plain',
      columnStyles: { 0: { cellWidth: 36, textColor: MUTED }, 1: { fontStyle: 'bold' } },
    });
    if (receipt.photo_path) {
      await drawPhoto(doc, receipt.photo_path, M, y, CONTENT_W, BOTTOM - y);
    } else {
      doc.setFontSize(10).setTextColor(...MUTED).text('Geen foto bij dit bonnetje.', M, y);
    }
    footer(doc, `Bonnetje ${fmtDate(receipt.receipt_date)} · ${clientLabel(client)}`);
    return doc;
  }

  return { report, single };
})();
