// clean twin: a story may import Storybook itself on top of uiMayImport
import { fn } from "storybook/test";
import { Button } from "./Button";
export default { component: Button, args: { onClick: fn() } };
export const Primary = {};
