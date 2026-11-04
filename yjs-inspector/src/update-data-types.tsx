import { DataItemProps, defineDataType, objectType } from "@textea/json-viewer";
import { ComponentType } from "react";
import * as Y from "yjs";
import { Badge } from "./components/ui/badge";
import { toast } from "./components/ui/use-toast";
import { isYItem } from "./y-shape";

// Mirrors the TypeLabel badge from data-types.tsx for raw update structs.
const UpdateTypeLabel = ({ value }: { value: unknown }) => (
  <Badge
    variant="outline"
    className="mr-1 cursor-pointer"
    onClick={(e) => {
      e.stopPropagation();
      // Log the raw Y.Item so it can be inspected in the console.
      console.log(value);
      toast({
        duration: 2000,
        description: "Check the console for the value",
      });
    }}
  >
    Update (YItem)
  </Badge>
);

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
    Object.entries(valueAsObject).filter(([, value]) => value !== null),
  );

  return simplifiedValue;
};

const YItemComponent: ComponentType<DataItemProps<Y.Item>> = ({
  value,
  prevValue,
  ...props
}: DataItemProps<Y.Item>) => {
  const ObjComponent = objectType.Component!;

  const simplifiedValue = simplifyYItem(value);

  return (
    <ObjComponent
      value={simplifiedValue}
      prevValue={prevValue}
      {...props}
    ></ObjComponent>
  );
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
      <UpdateTypeLabel value={value} />
      <ObjPreComponent
        value={simplifiedValue}
        prevValue={prevValue as object}
        {...props}
      ></ObjPreComponent>
    </span>
  );
};

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
    return (
      typeof value === "object" &&
      value !== null &&
      "client" in value &&
      "clock" in value
    );
  },
  Component: ({ value }: DataItemProps<object>) => {
    let shortClientId;

    if (
      typeof value === "object" &&
      value !== null &&
      "client" in value &&
      "clock" in value
    ) {
      shortClientId = `{ client: ${value.client}, clock: ${value.clock} }`;
    } else {
      shortClientId = JSON.stringify(value);
    }

    return <span>{shortClientId}</span>;
  },
});

export const updateDataTypes = [yItemDataType, clientIdDataType];
