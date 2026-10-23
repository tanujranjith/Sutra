export async function openResponseDetails(root, section = 'Sources') {
  const trigger = root.getByRole('button', { name: 'Response details', exact: true }).last();
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const card = root.getByRole('dialog', { name: 'Response details', exact: true }).last();
  await card.getByRole('tab', { name: section, exact: true }).click();
  return card;
}
