# WebUntis

Connecteur non officiel, sans lien avec Untis GmbH. Il lit un emploi du temps
scolaire **WebUntis**, en lecture seule, et l'amène dans Gladys : un widget de
tableau de bord, des déclencheurs de scène quand un cours est annulé ou
modifié et au début des cours, et une action de scène pour lire une journée
d'école.

**Jamais testé avec un vrai compte** : il a été construit d'après l'interface
JSON-RPC de WebUntis telle que l'utilise la bibliothèque libre python-webuntis.
Merci de signaler ce qui marche et ce qui ne marche pas.

## Ce qu'il faut

- L'adresse de la page WebUntis de l'école, par exemple
  `https://neilo.webuntis.com/WebUntis/?school=demo-school#/basic/login`.
- Un compte WebUntis **élève ou enseignant** de cette école (identifiant et
  mot de passe). Un compte parent n'a pas d'emploi du temps à lui : saisissez
  aussi le nom de la classe (voir plus bas).

## Configuration

| Champ                               | Quoi saisir                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Serveur WebUntis                    | L'hôte de la page (`neilo.webuntis.com`) ; l'adresse complète peut être collée. Toujours joint en HTTPS.                  |
| Nom de l'école                      | La partie `school=` de l'adresse (`demo-school`).                                                                         |
| Identifiant, mot de passe           | Le compte WebUntis.                                                                                                       |
| Classe (facultatif)                 | Vide : l'emploi du temps du compte. Un nom de classe comme WebUntis l'affiche (`7b`) : l'emploi du temps de cette classe. |
| Fuseau horaire de l'école           | Berlin par défaut (Vienne, Zurich et d'autres proposés).                                                                  |
| Intervalle de lecture               | 30 minutes par défaut, 15 au minimum.                                                                                     |
| Jours lus à l'avance                | 7 par défaut (aujourd'hui et la semaine suivante).                                                                        |
| « Début des cours » : minutes avant | 60 par défaut.                                                                                                            |

Le mot de passe est gardé par Gladys dans sa base, jamais réaffiché, et envoyé
uniquement au serveur WebUntis de l'école, dans la requête de connexion.
L'intégration ne journalise jamais l'identifiant, le mot de passe, l'école,
une classe ni le nom d'un élève, ni les cours : seulement des nombres et des
codes d'erreur.

## Comment il lit

Chaque lecture est une courte session : connexion, l'emploi du temps
d'aujourd'hui jusqu'aux jours à l'avance, déconnexion. Pour ménager le serveur
de l'école, que tous les élèves partagent :

- une lecture toutes les 30 minutes par défaut, jamais plus d'une toutes les
  15 minutes ;
- rien ne lit plus tôt : ni le bouton « Tester la connexion », ni un
  redémarrage de l'intégration, ni une reconnexion à Gladys, ni
  l'enregistrement d'une configuration inchangée (l'heure de la dernière
  tentative est conservée) ;
- quand le serveur répond « trop de requêtes » (429) ou a un problème (5xx),
  les lectures se mettent en pause (son Retry-After, ou 30 minutes ; 6 heures
  au plus), y compris à travers un redémarrage ; un accès refusé (401/403) les
  met en pause 6 heures ;
- quand WebUntis **refuse la connexion** (identifiant ou mot de passe faux,
  compte bloqué, mot de passe expiré, tout autre refus), plus rien n'est
  envoyé avec ces identifiants, même après un redémarrage, tant que vous ne
  les changez pas. Le bouton de test peut réessayer une fois, pas avant la fin
  de l'intervalle ; le refus n'est oublié qu'après une connexion réussie.
  Plusieurs connexions ratées peuvent bloquer un compte WebUntis : vérifiez
  d'abord le mot de passe sur la page de l'école.

Élargir « jours lus à l'avance » annonce, à la lecture suivante, les
annulations et modifications déjà connues des nouveaux jours (20 de chaque
sorte au plus).

## Widget « Emploi du temps »

Les cours d'une journée : heure, matière, salle et enseignant ; un cours annulé
en rouge, un cours modifié en orange, un examen en bleu ; l'heure de la
lecture. Choisissez le jour affiché : aujourd'hui puis le prochain jour d'école
(par défaut), aujourd'hui, demain, ou le prochain jour d'école.

## Déclencheurs de scène

| Déclencheur     | Quand                                                                                                                   | Filtres                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Cours annulé    | Un cours des prochains jours est désormais annulé.                                                                      | Matière (nom court), quand (aujourd'hui, demain, plus tard). |
| Cours modifié   | Un cours a un remplacement : autre enseignant, salle ou horaire, ou un texte de l'école. À nouveau à chaque changement. | Matière, quand.                                              |
| Début des cours | Une fois par jour d'école, le nombre de minutes configuré avant le premier cours maintenu.                              | Jours de la semaine.                                         |

Un changement est vu à la lecture suivante (toutes les 30 minutes par défaut),
pas en direct. La première lecture après la configuration ne fait que retenir
l'emploi du temps : elle ne déclenche rien. Les cours passés ne déclenchent
jamais rien.

Les variables des déclencheurs s'utilisent sous la forme
`{{triggerEvent.data.<clé>}}`, par exemple `{{triggerEvent.data.subject}}`,
`{{triggerEvent.data.start}}`, `{{triggerEvent.data.room}}`,
`{{triggerEvent.data.text}}`, ou pour « début des cours »
`{{triggerEvent.data.first_start}}` et `{{triggerEvent.data.late_start}}`
(vrai quand le premier cours est annulé).

## Action de scène « Lire une journée d'école »

Les cours d'une journée d'après la dernière lecture (sans nouvelle requête) :
date, cours maintenus, annulés, modifiés, examens, premier début, première
matière, fin de la journée, la liste un cours par ligne. Pratique pour un
message du matin.

## Limites

- Lecture seule : ni devoirs, ni messages, ni absences (ils ne sont pas dans
  l'interface JSON-RPC qu'utilise l'intégration).
- Un emploi du temps par intégration.
- Un cours modifié quelques minutes avant son début peut être vu après qu'il a
  commencé (l'intervalle).
- Certaines écoles désactivent l'interface JSON-RPC ou ne donnent pas aux
  élèves le droit d'y lire leur emploi du temps : le statut le dit alors.
