/* Veille techno : affiche les articles validés (veille/articles.json).
   Sécurité : contenu inséré uniquement avec textContent, liens https:// seulement,
   longueurs limitées. Aucune erreur ne doit casser le reste de la page. */
(function () {
    'use strict';

    var FICHIER = 'veille/articles.json';
    var MAX_ARTICLES = 100;
    var liste = document.getElementById('veille-liste');
    var vide = document.getElementById('veille-vide');
    var erreur = document.getElementById('veille-erreur');
    if (!liste || !vide || !erreur) return;

    function cut(valeur, max) {
        var s = String(valeur == null ? '' : valeur).trim();
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
    }

    function lienSur(valeur) {
        try {
            var u = new URL(String(valeur), location.href);
            return u.protocol === 'https:' ? u.href : '';
        } catch (e) {
            return '';
        }
    }

    // « 2026-11-06 » devient « 06/11/2026 » (même écriture en français et en espagnol)
    function dateLisible(iso) {
        var p = String(iso || '').split('-');
        if (p.length !== 3 || p[0].length !== 4 || p[1].length !== 2 || p[2].length !== 2) return '';
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function el(tag, classe, texte) {
        var n = document.createElement(tag);
        if (classe) n.className = classe;
        if (texte !== undefined) n.textContent = texte;
        return n;
    }

    function carte(a) {
        if (!a || typeof a !== 'object') return null;
        var titre = cut(a.titre, 200);
        var href = lienSur(a.url);
        var date = dateLisible(a.date);
        if (!titre || !href || !date) return null;

        var li = el('li', 'v-item reveal');

        var meta = el('p', 'v-meta');
        meta.appendChild(el('span', null, cut(a.source, 60)));
        meta.appendChild(document.createTextNode(' · '));
        meta.appendChild(el('span', null, 'Publié le'));
        meta.appendChild(document.createTextNode(' '));
        meta.appendChild(el('time', null, date));
        li.appendChild(meta);

        var lien = el('a', 'v-titre', titre);
        lien.href = href;
        lien.target = '_blank';
        lien.rel = 'noopener noreferrer';
        li.appendChild(lien);

        var resume = cut(a.resume, 600);
        if (resume) li.appendChild(el('p', 'v-resume', resume));

        var tags = Array.isArray(a.tags) ? a.tags.slice(0, 3) : [];
        var ul = el('ul', 'tags');
        tags.forEach(function (t) {
            var txt = cut(t, 30);
            if (txt) ul.appendChild(el('li', null, txt));
        });
        if (ul.children.length) li.appendChild(ul);

        return li;
    }

    function afficher(articles) {
        liste.textContent = '';
        erreur.hidden = true;
        var n = 0;
        articles.slice(0, MAX_ARTICLES).forEach(function (a) {
            var c = carte(a);
            if (c) { liste.appendChild(c); n++; }
        });
        vide.hidden = n > 0;
        if (n && typeof window.portfolioDynamic === 'function') window.portfolioDynamic(liste);
    }

    function echec() {
        liste.textContent = '';
        vide.hidden = true;
        erreur.hidden = false;
    }

    fetch(FICHIER, { cache: 'no-cache', credentials: 'same-origin' })
        .then(function (r) {
            // Fichier pas encore publié : même affichage que « aucun article »
            if (r.status === 404) return [];
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            if (!Array.isArray(data)) throw new Error('Format inattendu');
            afficher(data);
        })
        .catch(echec);
})();
