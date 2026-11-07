import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./Input";

const meta = {
  component: Input,
  args: { "aria-label": "Product id", placeholder: "Product id" },
} satisfies Meta<typeof Input>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Filled: Story = { args: { defaultValue: "widget" } };
