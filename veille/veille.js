/* Veille techno : affiche les articles validés (veille/articles.json).
   Sécurité : contenu inséré uniquement avec textContent, liens https:// seulement,
   longueurs limitées. Aucune erreur ne doit casser le reste de la page.
   Traduction : chaque changement de texte passe par window.portfolioDynamic (voir main.js). */
(function () {
    'use strict';

    var FICHIER = 'veille/articles.json';
    var MAX_ARTICLES = 200;
    var PAGE = 10;
    var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    var conteneur = document.getElementById('veille-liste');
    var vide = document.getElementById('veille-vide');
    var aucun = document.getElementById('veille-aucun');
    var erreur = document.getElementById('veille-erreur');
    var compteur = document.getElementById('veille-compteur');
    var stat = document.getElementById('veille-stat');   // pastille « N articles publiés » de l'introduction (facultative)
    var barre = document.getElementById('veille-barre');
    var recherche = document.getElementById('veille-recherche');
    var zoneSources = document.getElementById('veille-sources');
    var zoneTags = document.getElementById('veille-tags');
    var btnPlus = document.getElementById('veille-plus');
    var btnReset = document.getElementById('veille-reset');
    if (!conteneur || !vide || !aucun || !erreur || !compteur || !barre || !recherche || !zoneSources || !zoneTags || !btnPlus || !btnReset) return;

    var cartes = [];                  // { li, corps, bouton, mois, source, tags[], texte }
    var etat = { source: '', tag: '', mot: '', limite: PAGE };
    var sections = {};                // clé de mois -> { section, liste }

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

    // « 2026-11-06 » devient { iso, lisible: « 06/11/2026 », mois: « 2026-11 », m: 10, a: « 2026 » }
    function dateInfo(iso) {
        var p = String(iso || '').split('-');
        if (p.length !== 3 || p[0].length !== 4 || p[1].length !== 2 || p[2].length !== 2) return null;
        var m = Number(p[1]), j = Number(p[2]);
        if (!(m >= 1 && m <= 12) || !(j >= 1 && j <= 31) || isNaN(Number(p[0]))) return null;
        return { iso: p.join('-'), lisible: p[2] + '/' + p[1] + '/' + p[0], mois: p[0] + '-' + p[1], m: m - 1, a: p[0] };
    }

    function el(tag, classe, texte) {
        var n = document.createElement(tag);
        if (classe) n.className = classe;
        if (texte !== undefined) n.textContent = texte;
        return n;
    }

    // Traduction des textes ajoutés (espagnol) : toujours après une insertion ou un changement de texte
    function traduire(racine) {
        if (typeof window.portfolioDynamic === 'function') window.portfolioDynamic(racine);
    }

    function normaliser(s) {
        var t = String(s || '').toLowerCase();
        try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* navigateur ancien : on garde les accents */ }
        return t;
    }

    /* ---------- Carte d'un article ---------- */
    var compteId = 0;
    function construireCarte(a) {
        if (!a || typeof a !== 'object') return null;
        var titre = cut(a.titre, 200);
        var href = lienSur(a.url);
        var d = dateInfo(a.date);
        if (!titre || !href || !d) return null;
        var source = cut(a.source, 60);
        var resume = cut(a.resume, 1000);
        var tags = [];
        (Array.isArray(a.tags) ? a.tags : []).slice(0, 8).forEach(function (t) {
            var x = cut(t, 40);
            if (x && tags.indexOf(x) < 0) tags.push(x);
        });

        compteId++;
        var idCorps = 'veille-corps-' + compteId;
        var li = el('li', 'v-item');

        var h = el('h4', 'v-h');
        var bouton = el('button', 'v-tete');
        bouton.type = 'button';
        bouton.setAttribute('aria-expanded', 'false');
        bouton.setAttribute('aria-controls', idCorps);
        var meta = el('span', 'v-meta');
        var time = el('time', null, d.lisible);
        time.setAttribute('datetime', d.iso);
        meta.appendChild(time);
        if (source) {
            meta.appendChild(document.createTextNode(' · '));
            meta.appendChild(el('span', null, source));
        }
        bouton.appendChild(meta);
        bouton.appendChild(el('span', 'v-titre', titre));
        if (tags.length) {
            var zt = el('span', 'v-tagsligne');
            tags.forEach(function (t) { zt.appendChild(el('span', 'v-tag', t)); });
            bouton.appendChild(zt);
        }
        h.appendChild(bouton);
        li.appendChild(h);

        var corps = el('div', 'v-corps');
        corps.id = idCorps;
        corps.hidden = true;
        if (resume) corps.appendChild(el('p', 'v-resume', resume));
        var lien = el('a', 'btn btn-o v-lire');
        lien.href = href;
        lien.target = '_blank';
        lien.rel = 'noopener noreferrer';
        lien.appendChild(el('span', null, 'Lire l\'article d\'origine'));
        lien.appendChild(el('span', 'sr-only', ' (nouvel onglet)'));
        corps.appendChild(lien);
        li.appendChild(corps);

        bouton.addEventListener('click', function () {
            var ouvert = bouton.getAttribute('aria-expanded') === 'true';
            bouton.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
            corps.hidden = ouvert;
        });

        return {
            li: li, d: d, source: source, tags: tags,
            texte: normaliser(titre + ' ' + resume + ' ' + source + ' ' + tags.join(' '))
        };
    }

    /* ---------- Mois et liste ---------- */
    function sectionMois(c) {
        var s = sections[c.d.mois];
        if (s) return s;
        var section = el('section', 'v-mois');
        var h = el('h4', 'v-moish');
        h.appendChild(el('span', null, MOIS[c.d.m]));
        h.appendChild(document.createTextNode(' '));
        h.appendChild(el('span', null, c.d.a));
        section.appendChild(h);
        var ul = el('ul', 'v-liste');
        section.appendChild(ul);
        conteneur.appendChild(section);
        s = sections[c.d.mois] = { section: section, liste: ul };
        return s;
    }

    function correspond(c) {
        if (etat.source && c.source !== etat.source) return false;
        if (etat.tag && c.tags.indexOf(etat.tag) < 0) return false;
        if (etat.mot) {
            var mots = etat.mot.split(' ');
            for (var i = 0; i < mots.length; i++) if (mots[i] && c.texte.indexOf(mots[i]) < 0) return false;
        }
        return true;
    }

    function ecrire(noeud, parties) {
        noeud.textContent = '';
        parties.forEach(function (p, i) {
            if (i) noeud.appendChild(document.createTextNode(' '));
            noeud.appendChild(el('span', p.nombre ? 'v-nb' : null, p.texte));
        });
        traduire(noeud);
    }

    function majStat(n) {
        if (!stat) return;
        ecrire(stat, [{ texte: String(n), nombre: true }, { texte: n > 1 ? 'articles publiés' : 'article publié' }]);
    }

    function rafraichir() {
        var filtre = !!(etat.source || etat.tag || etat.mot);
        var trouves = 0, montres = 0;
        var visiblesParMois = {};
        cartes.forEach(function (c) {
            var ok = correspond(c);
            var affiche = false;
            if (ok) {
                trouves++;
                if (trouves <= etat.limite) { affiche = true; montres++; }
            }
            c.li.hidden = !affiche;
            if (affiche) visiblesParMois[c.d.mois] = true;
        });
        Object.keys(sections).forEach(function (k) { sections[k].section.hidden = !visiblesParMois[k]; });

        aucun.hidden = trouves > 0;
        btnPlus.hidden = trouves <= etat.limite;
        btnReset.hidden = !filtre;

        var total = cartes.length;
        var libelle = [{ texte: String(trouves), nombre: true }];
        if (filtre) {
            libelle.push({ texte: trouves > 1 ? 'articles affichés' : 'article affiché' });
            libelle.push({ texte: 'sur' });
            libelle.push({ texte: String(total), nombre: true });
        } else {
            libelle.push({ texte: trouves > 1 ? 'articles publiés' : 'article publié' });
        }
        ecrire(compteur, libelle);
    }

    /* ---------- Filtres ---------- */
    function construireChips(zone, valeurs, cle) {
        zone.textContent = '';
        if (valeurs.length < 2) { zone.hidden = true; return; }
        zone.hidden = false;
        var boutons = [];
        function ajouter(libelle, valeur) {
            var b = el('button', 'v-chip', libelle);
            b.type = 'button';
            b.setAttribute('aria-pressed', valeur === '' ? 'true' : 'false');
            b.addEventListener('click', function () {
                etat[cle] = valeur;
                etat.limite = PAGE;
                boutons.forEach(function (x) { x.b.setAttribute('aria-pressed', x.v === valeur ? 'true' : 'false'); });
                rafraichir();
            });
            boutons.push({ b: b, v: valeur });
            zone.appendChild(b);
        }
        ajouter('Tous', '');
        valeurs.forEach(function (v) { ajouter(v, v); });
        zone.__boutons = boutons;
        traduire(zone);
    }

    function reinitialiser() {
        etat.source = ''; etat.tag = ''; etat.mot = ''; etat.limite = PAGE;
        recherche.value = '';
        [zoneSources, zoneTags].forEach(function (z) {
            (z.__boutons || []).forEach(function (x) { x.b.setAttribute('aria-pressed', x.v === '' ? 'true' : 'false'); });
        });
        rafraichir();
    }

    function lesPlusFrequents(liste, max) {
        var n = {};
        liste.forEach(function (v) { n[v] = (n[v] || 0) + 1; });
        return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || (a.toLowerCase() < b.toLowerCase() ? -1 : 1); }).slice(0, max);
    }

    /* ---------- Affichage ---------- */
    function afficher(articles) {
        conteneur.textContent = '';
        sections = {};
        cartes = [];
        erreur.hidden = true;
        aucun.hidden = true;

        var liste = [];
        articles.slice(0, MAX_ARTICLES).forEach(function (a, i) {
            var c = construireCarte(a);
            if (c) { c.ordre = i; liste.push(c); }
        });
        liste.sort(function (x, y) { return x.d.iso < y.d.iso ? 1 : x.d.iso > y.d.iso ? -1 : x.ordre - y.ordre; });
        liste.forEach(function (c) { sectionMois(c).liste.appendChild(c.li); });
        cartes = liste;

        majStat(cartes.length);
        vide.hidden = cartes.length > 0;
        barre.hidden = cartes.length === 0;
        btnPlus.hidden = true;
        btnReset.hidden = true;
        if (!cartes.length) {
            ecrire(compteur, [{ texte: '0', nombre: true }, { texte: 'article publié' }]);
            return;
        }
        var sources = [], tags = [];
        cartes.forEach(function (c) { if (c.source) sources.push(c.source); c.tags.forEach(function (t) { tags.push(t); }); });
        construireChips(zoneSources, lesPlusFrequents(sources, 8), 'source');
        construireChips(zoneTags, lesPlusFrequents(tags, 12), 'tag');
        traduire(conteneur);
        rafraichir();
    }

    function echec() {
        conteneur.textContent = '';
        cartes = [];
        vide.hidden = true;
        aucun.hidden = true;
        barre.hidden = true;
        btnPlus.hidden = true;
        btnReset.hidden = true;
        compteur.textContent = '';
        if (stat) stat.textContent = '';
        erreur.hidden = false;
    }

    /* ---------- Événements ---------- */
    var minuteur = null;
    recherche.addEventListener('input', function () {
        clearTimeout(minuteur);
        minuteur = setTimeout(function () {
            etat.mot = normaliser(recherche.value).replace(/\s+/g, ' ').trim();
            etat.limite = PAGE;
            rafraichir();
        }, 150);
    });
    btnPlus.addEventListener('click', function () {
        etat.limite += PAGE;
        rafraichir();
    });
    btnReset.addEventListener('click', reinitialiser);

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
