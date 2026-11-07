import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

const meta = {
  component: ConfirmDialog,
  args: {
    trigger: <Button variant="secondary">Cancel</Button>,
    title: "Cancel this order?",
    description: "A paid order is refunded.",
    dismiss: "Keep order",
    confirm: "Cancel order",
    onConfirm: () => {},
  },
} satisfies Meta<typeof ConfirmDialog>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Closed: Story = {};
