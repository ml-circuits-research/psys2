// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=3d7a7fb301';
import { chartToolInterface } from '../data.charts/declared-host.mjs?v=62201cd416';
import SOURCE from './native-interface-source.mjs?v=1aa7266de7';

export const diagramToolInterface = readNativeToolInterface(SOURCE, { imports: { 'data.charts': chartToolInterface } });
const declaration = diagramToolInterface.realize();
export const DIAGRAM_COMPONENTS = declaration.components;
export const DIAGRAM_TOOL_BINDINGS = declaration.bindings;
