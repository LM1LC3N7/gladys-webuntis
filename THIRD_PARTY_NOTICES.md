# Third-party notices

This integration is licensed under the Apache License 2.0 (see `LICENSE`).

It contains logic ported to JavaScript from the project below. Its license
requires its copyright notice, its conditions and its disclaimer to be
reproduced with any redistribution, in source or in binary form (the Docker
image ships this file).

## python-webuntis

- Project: https://github.com/python-webuntis/python-webuntis
- Version read: commit `172ddd16245c2993ac7cd0d06e340bfe1ea2b02c` (2026-07-08),
  published on PyPI as `webuntis` 0.1.25.
- Ported: the JSON-RPC request and its error codes (`webuntis/utils/remote.py`),
  the login, the timetable with its options, the class list and the logout
  (`webuntis/session.py`), the endpoint (`webuntis/utils/userinput.py`), the
  date and time formats (`webuntis/utils/datetime_utils.py`) and the meaning
  of the period fields (`webuntis/objects.py`), into `src/webuntis/client.js`,
  `src/webuntis/model.js` and `src/time.js`.
- License: BSD 3-Clause, reproduced in full below.

```
Copyright (c) 2013-2016, Markus Unterwaditzer
Copyright (c) 2018, August Hörandl

Some rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

*  Redistributions of source code must retain the above copyright notice, this
*  list of conditions and the following disclaimer.

*  Redistributions in binary form must reproduce the above copyright notice,
*  this list of conditions and the following disclaimer in the documentation
*  and/or other materials provided with the distribution.

*  The names of the contributors may not be used to endorse or promote products
*  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

The names of the python-webuntis contributors are cited here only to credit
their work, as the license requires; they do not endorse this integration.

WebUntis and Untis are trademarks of Untis GmbH. This integration is not
affiliated with Untis GmbH.
