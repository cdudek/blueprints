import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "./Badge";

const meta = { component: Badge, args: { children: "pending" } } satisfies Meta<typeof Badge>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Neutral: Story = {};
export const Danger: Story = { args: { tone: "danger", children: "cancelled" } };
