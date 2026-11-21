// SPDX-License-Identifier: AGPL-3.0-only
// The chart operations' declared interface (native-interface.sop), imported by the diagram area, which runs them by
// its SOP act rules. Nothing here decides: the chart types, parameters and defaults are the interface's declarations.
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=cf5c74f0fd';
import NATIVE_INTERFACE from './native-interface-source.mjs?v=6c0dc1d746';

export const chartToolInterface = readNativeToolInterface(NATIVE_INTERFACE);
