// a story is still a leaf for everything else: no package outside uiMayImport and Storybook
import { sum } from "lodash";
export default { title: "Chart" };
export const Total = { args: { total: sum([1, 2]) } };
