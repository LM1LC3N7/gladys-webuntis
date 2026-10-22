// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, action results, widget).
// Every text is a { en, fr } object: Gladys picks the user's language. No
// text ever carries the username, the password, a pupil's or a class name.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => (n === 1 ? one : many);
const s = (n) => (n > 1 ? 's' : '');

/** The reasons of a failed reading, as the WebUntisError codes give them. */
const REASONS = {
  network: { en: 'the server cannot be reached', fr: 'le serveur est injoignable' },
  timeout: { en: 'the server did not answer in time', fr: 'le serveur n’a pas répondu à temps' },
  protocol: {
    en: 'the server gave an unexpected answer',
    fr: 'le serveur a donné une réponse inattendue',
  },
  session: { en: 'the session was lost', fr: 'la session a été perdue' },
  remote: { en: 'WebUntis returned an error', fr: 'WebUntis a renvoyé une erreur' },
  server: { en: 'the server has a problem', fr: 'le serveur a un problème' },
};

export const T = {
  notConfigured: {
    en: 'Fill in the WebUntis server, the school, the username and the password in the configuration.',
    fr: 'Renseignez le serveur WebUntis, l’école, l’identifiant et le mot de passe dans la configuration.',
  },
  badServer: {
    en: 'The WebUntis server is not a host name: copy it from the address of your school’s WebUntis page (for example neilo.webuntis.com).',
    fr: 'Le serveur WebUntis n’est pas un nom d’hôte : copiez-le depuis l’adresse de la page WebUntis de l’école (par exemple neilo.webuntis.com).',
  },
  ok: ({ at, lessons, days, next }) => ({
    en: `Connected to WebUntis. Read at ${at}: ${lessons} ${plural(lessons, 'lesson', 'lessons')} in the next ${days} ${plural(days, 'day', 'days')}. Next reading at ${next}.`,
    fr: `Connecté à WebUntis. Lu à ${at} : ${lessons} cours sur les ${days} prochain${s(days)} jour${s(days)}. Prochaine lecture à ${next}.`,
  }),
  outsideSchoolYear: ({ at, next }) => ({
    en: `Connected to WebUntis. Read at ${at}: these dates are outside the school year. Next reading at ${next}.`,
    fr: `Connecté à WebUntis. Lu à ${at} : ces dates sont hors de l’année scolaire. Prochaine lecture à ${next}.`,
  }),
  waiting: (next) => ({
    en: `Waiting for the next reading at ${next}: the school’s server is never read more often than the interval.`,
    fr: `En attente de la prochaine lecture à ${next} : le serveur de l’école n’est jamais lu plus souvent que l’intervalle.`,
  }),
  badCredentials: {
    en: 'WebUntis refused the username or the password: nothing more is sent with them. Check them on the WebUntis page of the school, then save the configuration, or click "Test the connection" (one try, no sooner than the interval).',
    fr: 'WebUntis a refusé l’identifiant ou le mot de passe : plus rien n’est envoyé avec eux. Vérifiez-les sur la page WebUntis de l’école, puis enregistrez la configuration, ou cliquez sur « Tester la connexion » (un essai, pas avant la fin de l’intervalle).',
  },
  unknownSchool: {
    en: 'WebUntis does not know this school name on this server: copy the school name from the WebUntis page (the "school=" part of its address), then save the configuration.',
    fr: 'WebUntis ne connaît pas ce nom d’école sur ce serveur : copiez le nom d’école depuis la page WebUntis (la partie « school= » de son adresse), puis enregistrez la configuration.',
  },
  accountBlocked: {
    en: 'WebUntis says this account is blocked: nothing more is sent with it. Unblock it on the WebUntis page of the school (or ask the school), then click "Test the connection" (one try, no sooner than the interval).',
    fr: 'WebUntis indique que ce compte est bloqué : plus rien n’est envoyé avec lui. Débloquez-le sur la page WebUntis de l’école (ou demandez à l’école), puis cliquez sur « Tester la connexion » (un essai, pas avant la fin de l’intervalle).',
  },
  loginRefused: {
    en: 'WebUntis refused the login: nothing more is sent with these credentials. Check the account on the WebUntis page of the school (expired password, second factor...), then save the configuration, or click "Test the connection" (one try, no sooner than the interval).',
    fr: 'WebUntis a refusé la connexion : plus rien n’est envoyé avec ces identifiants. Vérifiez le compte sur la page WebUntis de l’école (mot de passe expiré, double authentification…), puis enregistrez la configuration, ou cliquez sur « Tester la connexion » (un essai, pas avant la fin de l’intervalle).',
  },
  forbidden: (minutes) => ({
    en: `The school’s server refused the access (HTTP 401/403): paused for ${minutes} min.`,
    fr: `Le serveur de l’école a refusé l’accès (HTTP 401/403) : en pause pour ${minutes} min.`,
  }),
  needsClass: {
    en: 'This account has no timetable of its own (a parent account?): enter the class name in the configuration.',
    fr: 'Ce compte n’a pas d’emploi du temps à lui (un compte parent ?) : saisissez le nom de la classe dans la configuration.',
  },
  unknownClass: {
    en: 'No class of this name at this school: enter it as WebUntis shows it.',
    fr: 'Aucune classe de ce nom dans cette école : saisissez-la comme WebUntis l’affiche.',
  },
  noRight: {
    en: 'This account may not read this timetable: leave the class name empty, or ask the school.',
    fr: 'Ce compte n’a pas le droit de lire cet emploi du temps : laissez le nom de la classe vide, ou demandez à l’école.',
  },
  notWebuntis: {
    en: 'No WebUntis at this server address: check the server in the configuration.',
    fr: 'Pas de WebUntis à cette adresse de serveur : vérifiez le serveur dans la configuration.',
  },
  paused: (minutes) => ({
    en: `The school’s server asked to slow down or has a problem: paused for ${minutes} min.`,
    fr: `Le serveur de l’école a demandé de ralentir ou a un problème : en pause pour ${minutes} min.`,
  }),
  failed: (code, next) => {
    const reason = REASONS[code] ?? REASONS.remote;
    return {
      en: `Reading failed: ${reason.en}. Next try at ${next}.`,
      fr: `Lecture échouée : ${reason.fr}. Nouvel essai à ${next}.`,
    };
  },
  testRead: (status) => ({
    en: `Read now. ${status.en}`,
    fr: `Lu à l’instant. ${status.fr}`,
  }),
  testNotDue: (status) => ({
    en: `Not read again: the interval since the last attempt is kept. ${status.en}`,
    fr: `Pas de nouvelle lecture : l’intervalle depuis la dernière tentative est respecté. ${status.fr}`,
  }),
  notRead: {
    en: 'The timetable has not been read yet.',
    fr: 'L’emploi du temps n’a pas encore été lu.',
  },
  widget: {
    title: 'WebUntis',
    notConfigured: {
      en: 'Configure the WebUntis account in the integration first',
      fr: 'Configurez d’abord le compte WebUntis dans l’intégration',
    },
    notRead: {
      en: 'Not read yet: the first reading comes at the next interval',
      fr: 'Pas encore lu : la première lecture arrive au prochain intervalle',
    },
    noLessons: { en: 'No lessons', fr: 'Pas de cours' },
    summary: ({ count, cancelled, changed, exams }) => ({
      en: [
        `${count} ${plural(count, 'lesson', 'lessons')}`,
        cancelled ? `${cancelled} cancelled` : '',
        changed ? `${changed} changed` : '',
        exams ? `${exams} ${plural(exams, 'exam', 'exams')}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      fr: [
        `${count} cours`,
        cancelled ? `${cancelled} annulé${s(cancelled)}` : '',
        changed ? `${changed} modifié${s(changed)}` : '',
        exams ? `${exams} examen${s(exams)}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }),
    readAt: (at) => ({ en: `Read at ${at}`, fr: `Lu à ${at}` }),
    cancelled: { en: 'Cancelled', fr: 'Annulé' },
    exam: { en: 'Exam', fr: 'Examen' },
    more: (n) => ({ en: `+ ${n} more`, fr: `+ ${n} de plus` }),
  },
};

const WEEKDAY_NAMES = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
};

/** "Wednesday 21/10" / "mercredi 21/10" for a date and its weekday index (0 = Monday). */
export function dayTitle(date, weekdayIndex) {
  const [, m, d] = date.split('-');
  return {
    en: `${WEEKDAY_NAMES.en[weekdayIndex]} ${d}/${m}`,
    fr: `${WEEKDAY_NAMES.fr[weekdayIndex]} ${d}/${m}`,
  };
}
