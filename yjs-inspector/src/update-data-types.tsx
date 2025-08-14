import {
  DataItemProps,
  defineDataType,
  objectType,
} from "@textea/json-viewer";
import { ComponentType } from "react";
import * as Y from "yjs";
import { isYItem } from "./y-shape";
import { TypeLabel } from "./data-types";

const simplifyYItem = (value: Y.Item) => {
  const valueAsObject = {
    id: value.id,
    length: value.length,
    origin: value.origin,
    left: value.left,
    right: value.right,
    rightOrigin: value.rightOrigin,
    parent: value.parent,
    parentSub: value.parentSub,
    redone: value.redone,
    content: value.content,
    info: value.info,
  };

  // Remove null entries from update struct
  const simplifiedValue = Object.fromEntries(
    Object.entries(valueAsObject).filter(([_, value]) => value !== null)
  );

  return simplifiedValue;
}

const YItemComponent: ComponentType<DataItemProps<Y.Item>> = ({
  value,
  prevValue,
  ...props
}: DataItemProps<Y.Item>) => {
  const ObjComponent = objectType.Component!;

    const simplifiedValue = simplifyYItem(value);

    return <ObjComponent
      value={simplifiedValue}
      prevValue={prevValue}
      {...props}
    ></ObjComponent>;
};

const PreComponentWrapper = ({
  value,
  prevValue,
  ...props
}: DataItemProps<unknown>) => {
  // Use a PreComponent wrapper to match other Yjs data types to avoid layout issues
  const ObjPreComponent = objectType.PreComponent!;

  const simplifiedValue = simplifyYItem(value as Y.Item);

  return (
    <span>
      <TypeLabel value={value} />
      <ObjPreComponent
        value={simplifiedValue}
        prevValue={prevValue as object}
        {...props}
      ></ObjPreComponent>
    </span>
  );
}

const PostComponentWrapper = ({
  value,
  prevValue,
  ...props
}: DataItemProps<object>) => {
  // Use a PostComponent wrapper to match other Yjs data types to avoid layout issues
  const ObjPostComponent = objectType.PostComponent!;

  const simplifiedValue = simplifyYItem(value as Y.Item);

  return (
    <ObjPostComponent
      value={simplifiedValue}
      prevValue={prevValue as object}
      {...props}
    ></ObjPostComponent>
  );
};

const yItemDataType = defineDataType<Y.Item>({
  is: isYItem,
  PreComponent: PreComponentWrapper,
  PostComponent: PostComponentWrapper,
  Component: YItemComponent,
});

// Display client IDs ("{ client: <clientId>, clock: <clock> }") on one line
const clientIdDataType = defineDataType<object>({
  is: (value) => {
    return typeof value === 'object' && value !== null && 'client' in value && 'clock' in value;
  },
  Component: ({ value }: DataItemProps<object>) => {
    let shortClientId;

    if (typeof value === 'object' && value !== null && 'client' in value && 'clock' in value) {
      shortClientId = `{ client: ${value.client}, clock: ${value.clock} }`;
    } else {
      shortClientId = JSON.stringify(value);
    }

    return <span>{shortClientId}</span>;
  }
});

export const updateDataTypes = [yItemDataType, clientIdDataType];
