import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { validationError } from "remix-validated-form";
import {
  CustomerTypeForm,
  customerTypeValidator,
  getCustomerType,
  upsertCustomerType,
} from "~/modules/sales";
import { requirePermissions } from "~/services/auth";
import { flash } from "~/services/session.server";
import { assertIsPost, notFound } from "~/utils/http";
import { path } from "~/utils/path";
import { error, success } from "~/utils/result";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client } = await requirePermissions(request, {
    view: "sales",
    role: "employee",
  });

  const { customerTypeId } = params;
  if (!customerTypeId) throw notFound("customerTypeId not found");

  const customerType = await getCustomerType(client, customerTypeId);

  if (customerType?.data?.protected) {
    return redirect(
      path.to.customerTypes,
      await flash(request, error(null, "Cannot edit a protected customer type"))
    );
  }

  return json({
    customerType: customerType?.data ?? null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, userId } = await requirePermissions(request, {
    update: "sales",
  });

  const validation = await customerTypeValidator.validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { id, ...data } = validation.data;
  if (!id) throw new Error("id not found");

  const updateCustomerType = await upsertCustomerType(client, {
    id,
    ...data,
    updatedBy: userId,
  });

  if (updateCustomerType.error) {
    return json(
      {},
      await flash(
        request,
        error(updateCustomerType.error, "Failed to update customer type")
      )
    );
  }

  return redirect(
    path.to.customerTypes,
    await flash(request, success("Updated customer type"))
  );
}

export default function EditCustomerTypesRoute() {
  const { customerType } = useLoaderData<typeof loader>();

  const initialValues = {
    id: customerType?.id ?? undefined,
    name: customerType?.name ?? "",
    color: customerType?.color ?? "#000000",
  };

  return (
    <CustomerTypeForm key={initialValues.id} initialValues={initialValues} />
  );
}
