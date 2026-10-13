# PostgreSQL local jetable — procédure

Teste les migrations Prisma (dont `9_phase7_materials_per_node`) et les routes de matériaux par image contre un vrai PostgreSQL, **sur cette machine seulement**, sans jamais toucher Neon ni aucun secret de production.

- Bac à sable : `<lecteur système>:/rb-pgtest` (en pratique `C:/rb-pgtest`), seul dossier créé, seul dossier supprimé.
- Serveur : `127.0.0.1:55432` uniquement, base `rb_materials_test`, rôle `rb_test` (sans droits d'administration), super-utilisateur `rb_admin` avec un mot de passe distinct.
- Chemins du dépôt : déduits de l'emplacement de ce dossier, aucun chemin absolu écrit en dur.

## Fichiers

| Fichier                                                                                | Rôle                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `rb-pgtest.sh`                                                                         | Lanceur à charger dans Git Bash : `rb_run <ÉTAPE>`, verrous, autorisations, `rb_neon_version`            |
| `step.sh`, `lib.sh`                                                                    | Une étape dans un Bash enfant à l'environnement vidé (`env -i`), `set -Eeuo pipefail`, `inherit_errexit` |
| `zip-check.mjs`                                                                        | Valide l'archive ZIP avant toute extraction (chemins, collisions, en-têtes, entrées spéciales, ZIP64)    |
| `extract-check.mjs`                                                                    | Vérifie l'extraction : nom, type, taille et CRC-32 de chaque fichier, rien en trop, aucun lien           |
| `policy.mjs`                                                                           | Politique Authenticode, appliquée avant la première exécution d'un binaire                               |
| `inventory.mjs`                                                                        | Inventaire avant suppression : liste d'autorisation, marqueur, empreinte SHA-256 du contenu              |
| `guard.mjs`                                                                            | Garde unique (shell et Vitest) : seule l'URL du bac à sable, aucune valeur des `.env`                    |
| `neon-version.mjs`                                                                     | Version de Neon par l'API de la console (jamais par la base)                                             |
| `pg-sandbox.test.ts`                                                                   | Tests synthétiques de tout ce qui précède (exécutés par `pnpm test`)                                     |
| `../../src/app/api/projects/[projectId]/nodes/[nodeId]/materials-per-image.pg.test.ts` | Tests des routes sur PostgreSQL réel, sautés sauf en T1                                                  |

## Préconditions

1. Git Bash **non administrateur** ; Node ≥ 22.2 (24 sur cette machine) ; `tar.exe`, `curl.exe` et le runtime Visual C++ dans `System32` (vérifiés par P1).
2. `C:/rb-pgtest` absent, port 55432 libre, plus de 2 Go libres, pas de `.env` ni de `package.json` à la racine du lecteur (P1).
3. Migration 9 identique à la version auditée (SHA-256 `08434ab3…6388`), 13 migrations, Prisma 5.22.0 et ses moteurs installés (P1).
4. La version majeure de Neon : `rb_neon_version` (clé d'API Neon, saisie masquée) ou lue dans la console (Overview → panneau **Postgres**) puis `RB_NEON_MAJOR=<14–18>`.

## Autorisations (tapées dans le terminal, une par catégorie)

| Variable                 | Étapes                        | Ce qu'elle permet                                                                                 |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| —                        | P1, P2, P3, P5a, N1, N2a, N2b | Lecture, création du dossier et du marqueur, choix de version, validation de l'archive, nettoyage |
| `RB_ALLOW_DOWNLOAD=oui`  | P4a, P4b                      | Requête HEAD puis téléchargement chez EnterpriseDB                                                |
| `RB_ALLOW_INSTALL=oui`   | P5b → P11                     | Extraction, exécution des binaires, création de la grappe, démarrage du serveur, rôle et base     |
| `RB_ALLOW_MIGRATION=oui` | M1 → M5                       | Migrations Prisma sur la base locale                                                              |
| `RB_ALLOW_TESTS=oui`     | T1                            | Tests des routes sur la base locale                                                               |

`RB_SIGNATURE_POLICY=strict` (facultatif) refuse aussi les DLL non signées.

## Commandes, dans l'ordre

```bash
source <dépôt>/frontend/scripts/pg-sandbox/rb-pgtest.sh

rb_neon_version            # ou : RB_NEON_MAJOR=<version lue dans la console>
rb_run P1                  # préconditions, lecture seule
rb_run P2                  # dossier + marqueur (en premier) + dl/ work/
rb_run P3                  # archive EDB de la même version majeure que Neon

RB_ALLOW_DOWNLOAD=oui
rb_run P4a                 # adresse finale (HEAD), refusée si ce n'est pas l'archive attendue
rb_run P4b                 # téléchargement ; SHA-256 consignée
rb_run P5a                 # validation complète du ZIP, liste des fichiers à extraire

RB_ALLOW_INSTALL=oui
rb_run P5b                 # extraction de bin/ lib/ share/ seulement, vérifiée, rien d'exécuté
rb_run P6                  # signatures Authenticode, PUIS première exécution (-V)
rb_run P7                  # deux secrets, initdb
rb_run P8                  # démarrage sur 127.0.0.1:55432
rb_run P9                  # rôle, base, commentaire-marqueur (chaque ordre confirmé)
rb_run P10                 # garde : 1 acceptation, 13 refus attendus
rb_run P11                 # copie isolée de prisma/, contrôle préalable
```

### Migrations (autorisation distincte)

```bash
RB_ALLOW_MIGRATION=oui
rb_run M1                  # migrate status : code 1, les 13 migrations en attente
rb_run M2                  # migrate deploy
rb_run M3                  # migrate status : à jour
rb_run M4                  # 13 migrations, 10 contraintes, 5 index de la migration 9
rb_run M5                  # migrate diff --exit-code : aucun écart
```

### Tests (autorisation distincte)

```bash
RB_ALLOW_TESTS=oui
rb_run T1                  # Vitest sur PostgreSQL réel, puis comptage des données restantes
```

### Nettoyage (toujours possible, réessayable depuis N1)

```bash
rb_run N1                  # arrête le serveur du bac à sable s'il tourne (et lui seul)
rb_run N2a                 # inventaire ; affiche  RB_CONFIRM=<empreinte>
RB_CONFIRM=<empreinte affichée>
rb_run N2b                 # refait l'inventaire, supprime seulement si l'empreinte est identique
rb_pgtest_unload
```

## Garanties du lanceur

- Une étape ne s'exécute que si l'étape qui la précède dans la chaîne est la **dernière réussie**.
- Un échec de préparation, de migration ou de test **verrouille** ces trois familles ; le nettoyage reste possible.
- Un échec de N1, N2a ou N2b ne verrouille rien : on reprend à N1. N2b exige que N2a soit la dernière étape réussie et que `RB_CONFIRM` reprenne son empreinte, recalculée juste avant de supprimer.
- Dès qu'une étape de nettoyage a été lancée, plus aucune préparation, migration ni test n'est accepté.
- N2b ne supprime que des noms fixes sous le bac à sable, et seulement si : le marqueur est valide et désigne ce dossier, chaque élément est sur la liste d'autorisation, aucun lien ni point d'analyse Windows n'existe, aucun processus `postgres.exe` du bac à sable ne tourne, et le port 55432 est libre.

## Signatures

- L'archive ZIP n'est pas signée et EDB ne publie aucune somme : sa SHA-256 est consignée en P4b et recalculée en P6.
- **Constat du 2026-10-12 (18.6-5)** : EDB ne signe aucun exécutable du serveur dans l'archive (seul `stackbuilder.exe` l'est). D'où le mode **épinglé** : si la SHA-256 de l'archive figure dans `PINNED_ARCHIVES` (`policy.mjs`), pour ce nom de fichier exact, les `.exe` non signés sont acceptés. L'empreinte de 18.6-5 (`e2246ba9…84e2`) a été vérifiée contre une source indépendante du téléchargement : le manifeste `postgresql.json` du dépôt Scoop « main » (github.com/ScoopInstaller/Main). Pour une autre version, ajouter son empreinte après la même vérification, sinon P6 bloque.
- Le mode épinglé ne remplace que `standard` ; `strict` n'est jamais assoupli, et `RB_SIGNATURE_POLICY=pinned` est refusé.
- Hors archive épinglée : chaque `.exe` de `bin/` et `lib/` doit être Authenticode `Valid`, signé `O=EnterpriseDB…` ; sinon P6 bloque. Un `.exe` signé doit toujours l'être par EnterpriseDB.
- Une DLL signée par un éditeur de confiance est acceptée (OpenSSL, ICU, runtime Visual C++…).
- Une DLL non signée n'est acceptée qu'en mode `standard`, une fois tous les exécutables authentifiés, et parce que son CRC a été vérifié contre l'archive en P5b ; elle est listée. Le mode `strict` la refuse.
- Tout autre statut (`HashMismatch`, `NotTrusted`…) bloque.
