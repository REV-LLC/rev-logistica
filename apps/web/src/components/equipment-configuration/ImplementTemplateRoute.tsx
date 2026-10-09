"use client";

import { ActionIcon } from '@mantine/core';
import { IconArrowRight, IconBox, IconLayersIntersect, IconPlus, IconSettings } from '@tabler/icons-react';
import type { ConfigurationEntry } from './types';
import { buildImplementTemplateRoute, type TemplateRouteNode } from './implement-template-route';
import classes from './ImplementTemplateRoute.module.css';

type Props = {
  parentName: string;
  entries: ConfigurationEntry[];
  disabled?: boolean;
  onEdit: (entry: ConfigurationEntry) => void;
  onAdd?: (parentFamilyId: string | null) => void;
};

export default function ImplementTemplateRoute({ parentName, entries, disabled, onEdit, onAdd }: Props) {
  const route = buildImplementTemplateRoute(entries);
  return <div className={classes.surface}>
    <div className={classes.viewport} tabIndex={0} aria-label={`Ruta recomendada de ${parentName}`}>
      <div className={classes.flow}>
        <div className={`${classes.card} ${classes.principal}`} aria-label={`Equipo principal: ${parentName}`}>
          <IconBox size={19} aria-hidden="true" className={classes.icon} />
          <span className={classes.name}>{parentName}</span>
          {onAdd ? <ActionIcon variant="subtle" size="sm" disabled={disabled} aria-label="Agregar familia a la ruta"
            onClick={() => onAdd(null)}><IconPlus size={15} /></ActionIcon> : null}
        </div>
        {route.roots.length ? <ul className={classes.branches}>
          {route.roots.map(node => <RouteBranch key={node.entry.familyId} node={node} disabled={disabled} onEdit={onEdit} onAdd={onAdd} />)}
        </ul> : null}
      </div>
    </div>
    {!route.roots.length && !route.issues.length ? <p className={classes.empty}>Sin familias en la ruta.</p> : null}
    {route.issues.length ? <div className={classes.invalid}>
      <p className={classes.warning} role="status">Revisa los enlaces de la ruta.</p>
      <div className={classes.unlinked} aria-label="Familias sin ruta válida">
        {route.invalidEntries.map(entry => <FamilyCard key={entry.id} entry={entry} disabled={disabled} onEdit={onEdit} />)}
      </div>
    </div> : null}
  </div>;
}

type BranchProps = Pick<Props, 'disabled' | 'onEdit' | 'onAdd'> & { node: TemplateRouteNode };

function RouteBranch({ node, disabled, onEdit, onAdd }: BranchProps) {
  return <li className={classes.flow} data-template-family-id={node.entry.familyId}
    data-parent-family-id={node.entry.templateParentFamilyId ?? undefined}>
    <IconArrowRight size={19} className={classes.arrow} aria-hidden="true" />
    <FamilyCard entry={node.entry} disabled={disabled} onEdit={onEdit} onAdd={onAdd} />
    {node.children.length ? <ul className={classes.branches}>
      {node.children.map(child => <RouteBranch key={child.entry.familyId} node={child} disabled={disabled} onEdit={onEdit} onAdd={onAdd} />)}
    </ul> : null}
  </li>;
}

type CardProps = Pick<Props, 'disabled' | 'onEdit' | 'onAdd'> & { entry: ConfigurationEntry };

function FamilyCard({ entry, disabled, onEdit, onAdd }: CardProps) {
  const name = entry.family?.name || 'Familia sin nombre';
  return <div className={classes.card}>
    <IconLayersIntersect size={19} aria-hidden="true" className={classes.icon} />
    <span className={classes.name}>{name}</span>
    <div className={classes.actions}>
      <ActionIcon variant="subtle" size="sm" disabled={disabled} aria-label={`Configurar ruta de ${name}`}
        onClick={() => onEdit(entry)}><IconSettings size={15} /></ActionIcon>
      {onAdd ? <ActionIcon variant="subtle" size="sm" disabled={disabled} aria-label={`Agregar familia después de ${name}`}
        onClick={() => onAdd(entry.familyId!)}><IconPlus size={15} /></ActionIcon> : null}
    </div>
  </div>;
}
