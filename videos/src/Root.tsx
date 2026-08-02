import "./shared/index.css";
import type { FC } from "react";
import { CounterStrafingCompositions } from "./counter-strafing/register";

export const RemotionRoot: FC = () => {
  return (
    <>
      <CounterStrafingCompositions />
      {/* Add more topic registers here, e.g. <MatchHelperCompositions /> */}
    </>
  );
};
