import type { Database } from "@carbon/database";
import { getDateNYearsAgo } from "@carbon/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TypeOfValidator } from "~/types/validators";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "~/utils/supabase";
import type {
  accountCategoryValidator,
  accountSubcategoryValidator,
  accountValidator,
  currencyValidator,
  defaultAcountValidator,
  fiscalYearSettingsValidator,
  journalLineValidator,
  partLedgerValidator,
  paymentTermValidator,
} from "./accounting.models";
import type { Account, Transaction } from "./types";

type AccountWithTotals = Account & { level: number; totaling: string };

function addLevelsAndTotalsToAccounts(
  accounts: Account[]
): AccountWithTotals[] {
  let result: AccountWithTotals[] = [];
  let beginTotalAccounts: string[] = [];
  let endTotalAccounts: string[] = [];
  let hasHeading = false;

  accounts.forEach((account) => {
    if (account.type === "End Total") {
      endTotalAccounts.push(account.number);
    }

    let level =
      beginTotalAccounts.length -
      endTotalAccounts.length +
      (hasHeading ? 1 : 0);

    if (account.type === "Begin Total") {
      beginTotalAccounts.push(account.number);
    }

    if (account.type === "Heading") {
      level = 0;
      hasHeading = true;
    }

    let totaling = "";

    if (account.type === "End Total") {
      let startAccount = beginTotalAccounts.pop();
      let endAccount = endTotalAccounts.pop();

      totaling = `${startAccount}..${endAccount}`;
    }

    result.push({
      ...account,
      level,
      totaling,
    });
  });

  return result;
}

export async function deleteAccount(
  client: SupabaseClient<Database>,
  accountId: string
) {
  return client.from("account").delete().eq("id", accountId);
}

export async function deleteAccountCategory(
  client: SupabaseClient<Database>,
  accountSubcategoryId: string
) {
  return client.from("accountCategory").delete().eq("id", accountSubcategoryId);
}

export async function deleteAccountSubcategory(
  client: SupabaseClient<Database>,
  accountSubcategoryId: string
) {
  return client
    .from("accountSubcategory")
    .update({ active: false })
    .eq("id", accountSubcategoryId);
}

export async function deleteCurrency(
  client: SupabaseClient<Database>,
  currencyId: string
) {
  return client.from("currency").update({ active: false }).eq("id", currencyId);
}

export async function deletePaymentTerm(
  client: SupabaseClient<Database>,
  paymentTermId: string
) {
  return client
    .from("paymentTerm")
    .update({ active: false })
    .eq("id", paymentTermId);
}

export async function getAccount(
  client: SupabaseClient<Database>,
  accountId: string
) {
  return client.from("account").select("*").eq("id", accountId).single();
}

export async function getAccounts(
  client: SupabaseClient<Database>,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("account")
    .select("*", {
      count: "exact",
    })
    .eq("active", true);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true },
  ]);
  return query;
}

export async function getAccountsList(
  client: SupabaseClient<Database>,
  args?: {
    type?: string | null;
    incomeBalance?: string | null;
    classes?: string[];
  }
) {
  let query = client.from("account").select("number, name").eq("active", true);

  if (args?.type) {
    query = query.eq("type", args.type);
  }

  if (args?.incomeBalance) {
    query = query.eq("incomeBalance", args.incomeBalance);
  }

  if (args?.classes && args.classes.length > 0) {
    query = query.in("class", args.classes);
  }

  query = query.order("number", { ascending: true });
  return query;
}

export async function getAccountCategories(
  client: SupabaseClient<Database>,
  args: GenericQueryFilters & {
    name: string | null;
    class: string | null;
    incomeBalance: string | null;
  }
) {
  let query = client.from("accountCategories").select("*", {
    count: "exact",
  });

  if (args.name) {
    query = query.ilike("category", `%${args.name}%`);
  }

  if (args.class) {
    query = query.eq("class", args.class);
  }

  if (args.incomeBalance) {
    query = query.eq("incomeBalance", args.incomeBalance);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "category", ascending: true },
  ]);
  return query;
}

export async function getAccountCategoriesList(
  client: SupabaseClient<Database>
) {
  return client
    .from("accountCategory")
    .select("*")
    .order("category", { ascending: true });
}

export async function getAccountCategory(
  client: SupabaseClient<Database>,
  accountCategoryId: string
) {
  return client
    .from("accountCategory")
    .select("*")
    .eq("id", accountCategoryId)
    .single();
}

export async function getAccountSubcategories(
  client: SupabaseClient<Database>,
  args: GenericQueryFilters & {
    name: string | null;
  }
) {
  let query = client
    .from("accountSubcategory")
    .select("*", {
      count: "exact",
    })
    .eq("active", true);

  if (args.name) {
    query = query.ilike("name", `%${args.name}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true },
  ]);
  return query;
}

export async function getAccountSubcategoriesByCategory(
  client: SupabaseClient<Database>,
  accountCategoryId: string
) {
  return client
    .from("accountSubcategory")
    .select("*")
    .eq("accountCategoryId", accountCategoryId)
    .eq("active", true);
}

export async function getAccountSubcategory(
  client: SupabaseClient<Database>,
  accountSubcategoryId: string
) {
  return client
    .from("accountSubcategory")
    .select("*")
    .eq("id", accountSubcategoryId)
    .single();
}

function getAccountTotal(
  accounts: Account[],
  account: AccountWithTotals,
  type: "netChange" | "balance" | "balanceAtDate",
  transactionsByAccount: Record<string, Transaction>
) {
  if (!account.totaling) {
    return transactionsByAccount[account.number]?.[type] ?? 0;
  }

  let total = 0;
  const [start, end] = account.totaling.split("..");
  if (!start || !end) throw new Error("Invalid totaling");

  accounts.forEach((account) => {
    if (account.number >= start && account.number <= end) {
      total += transactionsByAccount[account.number]?.[type] ?? 0;
    }
  });

  return total;
}

export async function getBaseCurrency(client: SupabaseClient<Database>) {
  return client
    .from("currency")
    .select("*")
    .eq("isBaseCurrency", true)
    .single();
}

export async function getChartOfAccounts(
  client: SupabaseClient<Database>,
  args: Omit<GenericQueryFilters, "limit" | "offset"> & {
    name: string | null;
    incomeBalance: string | null;
    startDate: string | null;
    endDate: string | null;
  }
) {
  let accountsQuery = client.from("accounts").select("*").eq("active", true);

  if (args.incomeBalance) {
    accountsQuery = accountsQuery.eq("incomeBalance", args.incomeBalance);
  }

  accountsQuery = setGenericQueryFilters(accountsQuery, args, [
    { column: "number", ascending: true },
  ]);

  let transactionsQuery = client.rpc("journalLinesByAccountNumber", {
    from_date:
      args.startDate ?? getDateNYearsAgo(50).toISOString().split("T")[0],
    to_date: args.endDate ?? new Date().toISOString().split("T")[0],
  });

  const [accountsResponse, transactionsResponse] = await Promise.all([
    accountsQuery,
    transactionsQuery,
  ]);

  if (transactionsResponse.error) return transactionsResponse;
  if (accountsResponse.error) return accountsResponse;

  const transactionsByAccount = (
    transactionsResponse.data as unknown as Transaction[]
  ).reduce<Record<string, Transaction>>((acc, transaction: Transaction) => {
    acc[transaction.number] = transaction;
    return acc;
  }, {});

  const accounts: Account[] = accountsResponse.data as Account[];

  return {
    data: addLevelsAndTotalsToAccounts(accounts).map((account) => ({
      ...account,
      netChange: getAccountTotal(
        accounts,
        account,
        "netChange",
        transactionsByAccount
      ),

      balance: getAccountTotal(
        accounts,
        account,
        "balance",
        transactionsByAccount
      ),

      balanceAtDate: getAccountTotal(
        accounts,
        account,
        "balanceAtDate",
        transactionsByAccount
      ),
    })),
    error: null,
  };
}

export async function getCurrency(
  client: SupabaseClient<Database>,
  currencyId: string
) {
  return client.from("currency").select("*").eq("id", currencyId).single();
}

export async function getCurrencies(
  client: SupabaseClient<Database>,
  args: GenericQueryFilters & {
    name: string | null;
  }
) {
  let query = client
    .from("currency")
    .select("*", {
      count: "exact",
    })
    .eq("active", true);

  if (args.name) {
    query = query.ilike("name", `%${args.name}%`);
  }

  query = setGenericQueryFilters(query, args);
  return query;
}

export async function getCurrenciesList(client: SupabaseClient<Database>) {
  return client
    .from("currency")
    .select("code, name")
    .order("name", { ascending: true });
}

export async function getCurrentAccountingPeriod(
  client: SupabaseClient<Database>,
  date: string
) {
  return client
    .from("accountingPeriod")
    .select("*")
    .lte("startDate", date)
    .gte("endDate", date)
    .single();
}

export async function getDefaultAccounts(client: SupabaseClient<Database>) {
  return client.from("accountDefault").select("*").eq("id", true).single();
}

export async function getFiscalYearSettings(client: SupabaseClient<Database>) {
  return client.from("fiscalYearSettings").select("*").eq("id", true).single();
}

export async function getInventoryPostingGroup(
  client: SupabaseClient<Database>,
  args: {
    partGroupId: string | null;
    locationId: string | null;
  }
) {
  let query = client.from("postingGroupInventory").select("*");

  if (args.partGroupId === null) {
    query = query.is("partGroupId", null);
  } else {
    query = query.eq("partGroupId", args.partGroupId);
  }

  if (args.locationId === null) {
    query = query.is("locationId", null);
  } else {
    query = query.eq("locationId", args.locationId);
  }

  return query.single();
}

export async function getInventoryPostingGroups(
  client: SupabaseClient<Database>,
  args: GenericQueryFilters & {
    partGroup: string | null;
    location: string | null;
  }
) {
  let query = client.from("postingGroupInventory").select("*", {
    count: "exact",
  });

  if (args.partGroup) {
    query = query.eq("partGroupId", args.partGroup);
  }

  if (args.location) {
    query = query.eq("locationId", args.location);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "partGroupId", ascending: false },
  ]);
  return query;
}

export async function getPaymentTerm(
  client: SupabaseClient<Database>,
  paymentTermId: string
) {
  return client
    .from("paymentTerm")
    .select("*")
    .eq("id", paymentTermId)
    .single();
}

export async function getPaymentTerms(
  client: SupabaseClient<Database>,
  args: GenericQueryFilters & {
    name: string | null;
  }
) {
  let query = client
    .from("paymentTerm")
    .select("*", {
      count: "exact",
    })
    .eq("active", true);

  if (args.name) {
    query = query.ilike("name", `%${args.name}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true },
  ]);
  return query;
}

export async function getPaymentTermsList(client: SupabaseClient<Database>) {
  return client
    .from("paymentTerm")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });
}

export async function getPurchasingPostingGroup(
  client: SupabaseClient<Database>,
  args: {
    partGroupId: string | null;
    supplierTypeId: string | null;
  }
) {
  let query = client.from("postingGroupInventory").select("*");

  if (args.partGroupId === null) {
    query = query.is("partGroupId", null);
  } else {
    query = query.eq("partGroupId", args.partGroupId);
  }

  if (args.supplierTypeId === null) {
    query = query.is("supplierTypeId", null);
  } else {
    query = query.eq("supplierTypeId", args.supplierTypeId);
  }

  return query.single();
}

export async function getPurchasingPostingGroups(
  client: SupabaseClient<Database>,
  args: GenericQueryFilters & {
    partGroup: string | null;
    supplierType: string | null;
  }
) {
  let query = client.from("postingGroupPurchasing").select("*", {
    count: "exact",
  });

  if (args.partGroup) {
    query = query.eq("partGroupId", args.partGroup);
  }

  if (args.supplierType) {
    query = query.eq("supplierTypeId", args.supplierType);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "partGroupId", ascending: false },
  ]);
  return query;
}

export async function getPurchasingSalesGroup(
  client: SupabaseClient<Database>,
  args: {
    partGroupId: string | null;
    customerTypeId: string | null;
  }
) {
  let query = client.from("postingGroupInventory").select("*");

  if (args.partGroupId === null) {
    query = query.is("partGroupId", null);
  } else {
    query = query.eq("partGroupId", args.partGroupId);
  }

  if (args.customerTypeId === null) {
    query = query.is("customerTypeId", null);
  } else {
    query = query.eq("customerTypeId", args.customerTypeId);
  }

  return query.single();
}

export async function getSalesPostingGroups(
  client: SupabaseClient<Database>,
  args: GenericQueryFilters & {
    partGroup: string | null;
    customerType: string | null;
  }
) {
  let query = client.from("postingGroupSales").select("*", {
    count: "exact",
  });

  if (args.partGroup) {
    query = query.eq("partGroupId", args.partGroup);
  }

  if (args.customerType) {
    query = query.eq("customerTypeId", args.customerType);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "partGroupId", ascending: false },
  ]);
  return query;
}

export async function insertJournalLines(
  client: SupabaseClient<Database>,
  journalLines: TypeOfValidator<typeof journalLineValidator>[]
) {
  return client.from("journalLedger").insert(journalLines);
}

export async function insertJournalEntry(
  client: SupabaseClient<Database>,
  generalEntry: TypeOfValidator<typeof journalLineValidator>
) {
  return client.from("generalLedger").insert([generalEntry]);
}

export async function insertPartEntries(
  client: SupabaseClient<Database>,
  partEntries: TypeOfValidator<typeof partLedgerValidator>[]
) {
  return client.from("partLedger").insert(partEntries);
}

export async function insertPartLedger(
  client: SupabaseClient<Database>,
  partEntry: TypeOfValidator<typeof partLedgerValidator>
) {
  return client.from("partLedger").insert([partEntry]);
}

export async function updateDefaultAccounts(
  client: SupabaseClient<Database>,
  defaultAccounts: TypeOfValidator<typeof defaultAcountValidator> & {
    updatedBy: string;
  }
) {
  return client.from("accountDefault").update(defaultAccounts).eq("id", true);
}

export async function updateFiscalYearSettings(
  client: SupabaseClient<Database>,
  fiscalYearSettings: TypeOfValidator<typeof fiscalYearSettingsValidator> & {
    updatedBy: string;
  }
) {
  return client
    .from("fiscalYearSettings")
    .update(sanitize(fiscalYearSettings))
    .eq("id", true);
}

export async function upsertAccount(
  client: SupabaseClient<Database>,
  account:
    | (Omit<TypeOfValidator<typeof accountValidator>, "id"> & {
        createdBy: string;
      })
    | (Omit<TypeOfValidator<typeof accountValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in account) {
    return client.from("account").insert([account]).select("id").single();
  }
  return client
    .from("account")
    .update(sanitize(account))
    .eq("id", account.id)
    .select("id")
    .single();
}

export async function upsertAccountCategory(
  client: SupabaseClient<Database>,
  accountCategory:
    | (Omit<TypeOfValidator<typeof accountCategoryValidator>, "id"> & {
        createdBy: string;
      })
    | (Omit<TypeOfValidator<typeof accountCategoryValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in accountCategory) {
    return client
      .from("accountCategory")
      .insert([accountCategory])
      .select("id")
      .single();
  }
  return client
    .from("accountCategory")
    .update(sanitize(accountCategory))
    .eq("id", accountCategory.id)
    .select("id")
    .single();
}

export async function upsertAccountSubcategory(
  client: SupabaseClient<Database>,
  accountSubcategory:
    | (Omit<TypeOfValidator<typeof accountSubcategoryValidator>, "id"> & {
        createdBy: string;
      })
    | (Omit<TypeOfValidator<typeof accountSubcategoryValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in accountSubcategory) {
    return client
      .from("accountSubcategory")
      .insert([accountSubcategory])
      .select("id")
      .single();
  }
  return client
    .from("accountSubcategory")
    .update(sanitize(accountSubcategory))
    .eq("id", accountSubcategory.id)
    .select("id")
    .single();
}

export async function upsertCurrency(
  client: SupabaseClient<Database>,
  currency:
    | (Omit<TypeOfValidator<typeof currencyValidator>, "id"> & {
        createdBy: string;
      })
    | (Omit<TypeOfValidator<typeof currencyValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if (currency.isBaseCurrency) {
    await client
      .from("currency")
      .update({ isBaseCurrency: false })
      .eq("isBaseCurrency", true);
  }

  if ("createdBy" in currency) {
    return client.from("currency").insert([currency]).select("id").single();
  }
  return client
    .from("currency")
    .update(sanitize(currency))
    .eq("id", currency.id)
    .select("id")
    .single();
}

export async function upsertPaymentTerm(
  client: SupabaseClient<Database>,
  paymentTerm:
    | (Omit<TypeOfValidator<typeof paymentTermValidator>, "id"> & {
        createdBy: string;
      })
    | (Omit<TypeOfValidator<typeof paymentTermValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in paymentTerm) {
    return client
      .from("paymentTerm")
      .insert([paymentTerm])
      .select("id")
      .single();
  }
  return client
    .from("paymentTerm")
    .update(sanitize(paymentTerm))
    .eq("id", paymentTerm.id)
    .select("id")
    .single();
}
