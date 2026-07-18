import * as React from "react";

export interface MobileNavContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const MobileNavContext = React.createContext<MobileNavContextValue | null>(null);
