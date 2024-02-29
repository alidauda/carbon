import { IconButton } from "@carbon/react";
import { useFetcher } from "@remix-run/react";
import { BiLaptop, BiMoon, BiSun } from "react-icons/bi";
import { useMode } from "~/hooks/useMode";
import type { action } from "~/root";
import { path } from "~/utils/path";

const ModeSwitcher = () => {
  const mode = useMode();
  const nextMode = mode === "dark" ? "light" : "dark";
  const modeLabel = {
    light: <BiSun />,
    dark: <BiMoon />,
    system: <BiLaptop />,
  };

  const fetcher = useFetcher<typeof action>();

  return (
    <fetcher.Form
      action={path.to.root}
      method="post"
      onSubmit={() => {
        document.body.removeAttribute("style");
      }}
    >
      <input type="hidden" name="mode" value={nextMode} />

      <IconButton
        icon={modeLabel[nextMode]}
        aria-label="Light Mode"
        variant="ghost"
        type="submit"
      />
    </fetcher.Form>
  );
};

export default ModeSwitcher;
