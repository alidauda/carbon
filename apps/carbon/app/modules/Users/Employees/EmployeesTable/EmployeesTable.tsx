import { ActionMenu } from "@carbon/react";
import { Flex, MenuItem, VisuallyHidden } from "@chakra-ui/react";
import { useNavigate } from "@remix-run/react";
import type { ColumnDef } from "@tanstack/react-table";
import { memo, useMemo } from "react";
import { BsPencilSquare } from "react-icons/bs";
import { IoMdTrash } from "react-icons/io";
import { Table } from "~/components/Data";
import { usePermissions } from "~/hooks";
import type { Employee } from "~/modules/Users/types";

type EmployeesTableProps = {
  data: Employee[];
  count: number;
  withSelectableRows?: boolean;
};

const EmployeesTable = memo(
  ({ data, count, withSelectableRows = false }: EmployeesTableProps) => {
    const navigate = useNavigate();
    const permissions = usePermissions();

    const rows = data.map((d) => {
      // we should only have one user and employee per employee id
      if (
        d.user === null ||
        d.employeeType === null ||
        Array.isArray(d.user) ||
        Array.isArray(d.employeeType)
      ) {
        throw new Error("Expected user and employee type to be objects");
      }

      return d;
    });

    const columns = useMemo<ColumnDef<typeof rows[number]>[]>(() => {
      return [
        {
          accessorKey: "user.firstName",
          header: "First Name",
          cell: (item) => item.getValue(),
        },
        {
          accessorKey: "user.lastName",
          header: "Last Name",
          cell: (item) => item.getValue(),
        },
        {
          accessorKey: "user.email",
          header: "Email",
          cell: (item) => item.getValue(),
        },
        {
          accessorKey: "employeeType.name",
          header: "Employee Type",
          cell: (item) => item.getValue(),
        },
        {
          header: () => <VisuallyHidden>Actions</VisuallyHidden>,
          accessorKey: "user.id",
          cell: (item) => (
            <Flex justifyContent="end">
              {permissions.can("update", "users") && (
                <ActionMenu>
                  <MenuItem
                    icon={<BsPencilSquare />}
                    onClick={() =>
                      navigate(`/app/users/employees/${item.getValue()}`)
                    }
                  >
                    Edit Employee
                  </MenuItem>
                  <MenuItem
                    icon={<IoMdTrash />}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/app/users/employeess/deactivate/${item.getValue()}`
                      );
                    }}
                  >
                    Deactivate Employee
                  </MenuItem>
                </ActionMenu>
              )}
            </Flex>
          ),
        },
      ];
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const actions = useMemo(() => {
      return [
        {
          label: "Bulk Edit Permissions",
          onClick: (selected: typeof rows) => {
            console.log(selected);
          },
          disabled: !permissions.can("update", "users"),
        },
      ];
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <Table<typeof rows[number]>
        actions={actions}
        count={count}
        data={rows}
        columns={columns}
        withColumnOrdering
        withPagination
        withSelectableRows={withSelectableRows}
      />
    );
  }
);

EmployeesTable.displayName = "EmployeeTable";

export default EmployeesTable;
