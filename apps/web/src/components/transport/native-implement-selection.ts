import { createSelectionId } from './request-formatting';
import { availableForDocument, sameDocumentPart } from './request-equipment-configuration';
import type { DocumentPartOption } from './request-equipment-configuration';
import type { SelectedItem } from './request-types';

export type ImplementDocumentParent = {
  assetId: string; name: string; selectionId?: string;
  sourceDocumentItemId?: string; legacyOriginId?: string;
};

/** A real document line or a reviewed worksite origin, never a synthetic parent line. */
export function nativeImplementOption(option: DocumentPartOption, parent: ImplementDocumentParent): DocumentPartOption {
  if (!option.item || option.item.type === 'accessory') return { ...option, item: undefined };
  const links = parent.selectionId
    ? { parentCompositionNodeId: parent.selectionId, parentSourceDocumentItemId: undefined, parentLegacyOriginId: undefined }
    : parent.sourceDocumentItemId
      ? { parentCompositionNodeId: undefined, parentSourceDocumentItemId: parent.sourceDocumentItemId, parentLegacyOriginId: undefined }
      : parent.legacyOriginId
        ? { parentCompositionNodeId: undefined, parentSourceDocumentItemId: undefined, parentLegacyOriginId: parent.legacyOriginId }
        : null;
  return { ...option, item: links ? { ...option.item, ...links, componentParentAssetId: parent.assetId } : undefined };
}

export function appendNativeImplement(items: SelectedItem[], option: DocumentPartOption, parent: ImplementDocumentParent): SelectedItem[] {
  const reviewed = nativeImplementOption(option, parent);
  if (!reviewed.item || (parent.selectionId && !items.some(row => row.selectionId === parent.selectionId && row.assetId === parent.assetId)) ||
    !Number.isSafeInteger(option.quantity) || option.quantity <= 0 ||
    availableForDocument(reviewed.item, items) < option.quantity || items.some(row => sameDocumentPart(row, reviewed.item!))) return items;
  return [...items, { ...reviewed.item, selectionId: createSelectionId(), quantity: option.quantity }];
}
