/**
 * This file is a shim for loading Yjs from private APIs provided by the
 * `@wordpress/sync` package. This is done primarily to avoid packaging and
 * importing two different Yjs instances, which would result in this conflict:
 *
 * https://github.com/yjs/yjs/issues/438
 *
 * It also allows us to align on the same Yjs version automatically.
 *
 * Scripts in this repo should directly import 'yjs' which will resolve to this
 * file via Webpack.
 */
import { __dangerousOptInToUnstableAPIsOnlyForCoreModules } from '@wordpress/private-apis';
import { privateApis as syncPrivateApis, type SyncPrivateApis } from '@wordpress/sync';

const { unlock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.',
	'@wordpress/sync'
);

const { Y: Yjs } = unlock< SyncPrivateApis >( syncPrivateApis );

// Functions
export const applyUpdate = Yjs.applyUpdate;
export const encodeStateVector = Yjs.encodeStateVector;
export const encodeStateAsUpdate = Yjs.encodeStateAsUpdate;
export const createRelativePositionFromTypeIndex = Yjs.createRelativePositionFromTypeIndex;

// Shared types
export const Doc = Yjs.Doc;
export const Map = Yjs.Map;
export const Array = Yjs.Array;
export const Text = Yjs.Text;
export const XmlElement = Yjs.XmlElement;
export const XmlFragment = Yjs.XmlFragment;
export const XmlText = Yjs.XmlText;

// Utility types
export const RelativePosition = Yjs.RelativePosition;
export const AbsolutePosition = Yjs.AbsolutePosition;
export const Snapshot = Yjs.Snapshot;
export const UndoManager = Yjs.UndoManager;
