import type { ActionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { validationError } from "remix-validated-form";
import { CustomerForm } from "~/interfaces/Sales/Customers";
import { requirePermissions } from "~/services/auth";
import { insertCustomer, customerValidator } from "~/services/sales";
import { flash } from "~/services/session";
import { assertIsPost } from "~/utils/http";
import { error, success } from "~/utils/result";

export async function action({ request }: ActionArgs) {
  assertIsPost(request);
  const { client, userId } = await requirePermissions(request, {
    create: "sales",
  });

  const validation = await customerValidator.validate(await request.formData());

  if (validation.error) {
    return validationError(validation.error);
  }

  const {
    name,
    customerTypeId,
    customerStatusId,
    accountManagerId,
    taxId,
    description,
  } = validation.data;

  const createCustomer = await insertCustomer(client, {
    name,
    customerTypeId,
    customerStatusId,
    accountManagerId,
    taxId,
    description,
    createdBy: userId,
  });
  if (createCustomer.error) {
    return redirect(
      "/app/sales/customers",
      await flash(
        request,
        error(createCustomer.error, "Failed to insert customer")
      )
    );
  }

  const customerId = createCustomer.data[0]?.id;

  return redirect(
    `/app/sales/customers/${customerId}`,
    await flash(request, success("Created customer"))
  );
}

export default function CustomersNewRoute() {
  const initialValues = {
    name: "",
  };
  return <CustomerForm initialValues={initialValues} />;
}