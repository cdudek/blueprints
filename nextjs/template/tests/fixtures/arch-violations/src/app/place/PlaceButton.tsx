"use client";
// a client file may import an action: it gets a reference, the action's imports stay on the server
import { placeAction } from "./actions";

export const PlaceButton = () => <form action={placeAction} />;
