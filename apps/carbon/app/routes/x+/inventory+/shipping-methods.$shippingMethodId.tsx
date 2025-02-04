import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { validationError } from "remix-validated-form";
import type { ShippingCarrier } from "~/modules/inventory";
import {
  ShippingMethodForm,
  getShippingMethod,
  shippingMethodValidator,
  upsertShippingMethod,
} from "~/modules/inventory";
import { requirePermissions } from "~/services/auth";
import { flash } from "~/services/session.server";
import { assertIsPost, notFound } from "~/utils/http";
import { path } from "~/utils/path";
import { error, success } from "~/utils/result";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client } = await requirePermissions(request, {
    view: "inventory",
    role: "employee",
  });

  const { shippingMethodId } = params;
  if (!shippingMethodId) throw notFound("shippingMethodId not found");

  const shippingMethod = await getShippingMethod(client, shippingMethodId);

  return json({
    shippingMethod: shippingMethod?.data ?? null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, userId } = await requirePermissions(request, {
    update: "inventory",
  });

  const validation = await shippingMethodValidator.validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { id, ...data } = validation.data;
  if (!id) throw new Error("id not found");

  const updateShippingMethod = await upsertShippingMethod(client, {
    id,
    ...data,
    updatedBy: userId,
  });

  if (updateShippingMethod.error) {
    return json(
      {},
      await flash(
        request,
        error(updateShippingMethod.error, "Failed to update shipping method")
      )
    );
  }

  return redirect(
    path.to.shippingMethods,
    await flash(request, success("Updated shipping method"))
  );
}

export default function EditShippingMethodsRoute() {
  const { shippingMethod } = useLoaderData<typeof loader>();

  const initialValues = {
    id: shippingMethod?.id ?? undefined,
    name: shippingMethod?.name ?? "",
    carrier: (shippingMethod?.carrier ?? "") as ShippingCarrier,
    carrierAccountId: shippingMethod?.carrierAccountId ?? "",
    trackingUrl: shippingMethod?.trackingUrl ?? "",
  };

  return (
    <ShippingMethodForm key={initialValues.id} initialValues={initialValues} />
  );
}
