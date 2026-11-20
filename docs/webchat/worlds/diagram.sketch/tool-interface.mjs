// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=f24fe0f51c';
import { chartToolInterface } from '../data.charts/declared-host.mjs?v=50873b2bef';
import SOURCE from './native-interface-source.mjs?v=1aa7266de7';

export const diagramToolInterface = readNativeToolInterface(SOURCE, { imports: { 'data.charts': chartToolInterface } });
const declaration = diagramToolInterface.realize();
export const DIAGRAM_COMPONENTS = declaration.components;
export const DIAGRAM_TOOL_BINDINGS = declaration.bindings;
