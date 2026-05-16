import { Composition } from "remotion";
import { UpliftAsyncTransforms } from "./UpliftAsyncTransforms";

export function RemotionRoot() {
  return (
    <Composition
      id="UpliftAsyncTransforms"
      component={UpliftAsyncTransforms}
      durationInFrames={360}
      fps={30}
      width={1080}
      height={1350}
    />
  );
}
