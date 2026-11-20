// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';import {fileURLToPath} from 'node:url';
export const TOOL=path.dirname(fileURLToPath(import.meta.url));
export const PSYS2=path.resolve(TOOL,'../..');
export const WORKSPACE=path.resolve(PSYS2,'..');
