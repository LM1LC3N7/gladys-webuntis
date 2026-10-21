# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Connection to a school's WebUntis server through its JSON-RPC interface,
  with a pupil or teacher account, or a class name for an account without a
  timetable of its own (parent). Read only. Never tested with a real account.
- One short reading (login, timetable of the coming days, logout) every 30
  minutes by default, 15 at least; never sooner after a restart, a
  reconnection, an unchanged configuration or the test button.
- Refused credentials or an unknown school stop every request with them, also
  after a restart, until the configuration changes; 429 and 5xx answers pause
  the readings (6 hours at most), also after a restart.
- Dashboard widget "School timetable": the lessons of a day, cancellations,
  substitutions and exams.
- Scene triggers "lesson cancelled", "lesson changed" and "school day starts".
- Scene action "read a school day", from the last reading.
- "Test the connection" button.

### Security

- The password is sent only to the school's WebUntis server, in the login
  request, over HTTPS, never after a redirection. Nothing logged, shown or
  stored names the account, the school, a class, a pupil or a lesson.

[Unreleased]: https://github.com/LM1LC3N7/gladys-webuntis/commits/main
